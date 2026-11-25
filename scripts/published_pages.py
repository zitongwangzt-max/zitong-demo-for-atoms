import base64
import errno
import hashlib
import hmac
import os
import re
import secrets
import tempfile
from pathlib import Path

from model_api import ModelError


MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_AVATAR_BYTES = 3 * 1024 * 1024
PAGE_ID = re.compile(r"[A-Za-z0-9_-]{22}")
AVATAR_ID = re.compile(r"[a-f0-9]{64}")
AVATAR_SLOT = re.compile(
    r"<(?P<tag>div|a|figure)\b(?P<attrs>[^>]*?(?:\bdata-folio-avatar(?=[\s=>])|"
    r"""\bclass\s*=\s*(?:"[^"]*\bmonogram\b[^"]*"|'[^']*\bmonogram\b[^']*'))[^>]*)>"""
    r"(?P<body>.*?)</(?P=tag)\s*>",
    re.I | re.S,
)
AVATAR_PHOTO = re.compile(r"<img\b[^>]*\bdata-folio-avatar-photo(?=[\s=>])[^>]*>", re.I)
OLD_TEMPLATE_POLICY = "style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"


def validate_avatar(data):
    if len(data) > MAX_AVATAR_BYTES:
        raise ModelError(413, "avatar_too_large", "头像超出 3 MB，请选择较小的图片。")
    if (
        len(data) < 45 or not data.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
        or not data.endswith(b"\x00\x00\x00\x00IEND\xaeB\x60\x82")
        or not all(0 < int.from_bytes(data[offset:offset + 4], "big") <= 768 for offset in (16, 20))
    ):
        raise ModelError(400, "invalid_avatar", "头像无法读取，请重新选择图片。")


def avatar_data_url(data):
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def write_atomically(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    staged = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".write-", dir=path.parent, delete=False) as temporary:
            staged = Path(temporary.name)
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
        staged.replace(path)
    finally:
        if staged:
            staged.unlink(missing_ok=True)


def render_avatar(html, page_id, data):
    def replace(slot):
        tag, attrs, contents = slot.group("tag", "attrs", "body")
        attrs = re.sub(r"""\s+aria-hidden\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""", "", attrs, flags=re.I)
        if data:
            contents = AVATAR_PHOTO.sub("", contents)
            contents += (
                f'<img data-folio-avatar-photo src="{avatar_data_url(data)}" alt="头像" '
                'style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:var(--area-bg,var(--art,#edf0f8))">'
            )
        action = f'href="/page/{page_id}/avatar" aria-label="更换头像" title="更换头像" target="_blank" rel="noopener noreferrer"'
        if tag.lower() == "a":
            attrs = re.sub(r"""\s+(?:href|target|rel|aria-label|title)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""", "", attrs, flags=re.I)
            return f"<a{attrs} {action}>{contents}</a>"
        link = f'<a {action} style="position:absolute;inset:0;z-index:1;border-radius:inherit"></a>'
        return f"<{tag}{attrs}>{contents}{link}</{tag}>"

    text = html.decode("utf-8")
    text, count = AVATAR_SLOT.subn(replace, text, count=1)
    if count and data:
        text = text.replace(OLD_TEMPLATE_POLICY, "img-src data:; " + OLD_TEMPLATE_POLICY, 1)
    return text.encode("utf-8")


def avatar_editor_html(page_id, data, allowed):
    path = f"/page/{page_id}"
    if allowed:
        photo = f'<img src="{avatar_data_url(data)}" alt="当前头像">' if data else ""
        body = f"""
      <p>选择一张新图片，保存后即可回到原来的简历链接。</p>
      {photo}
      <form id="published-avatar-form" data-page="{path}">
        <label for="published-avatar-file">选择图片</label>
        <input id="published-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" required>
        <p id="published-avatar-feedback" role="status" hidden></p>
        <button type="submit">保存头像</button>
      </form>
      <script defer src="/folio-avatar.js"></script>"""
    else:
        body = "<p>头像由发布者管理。可以用发布该网页的浏览器打开这个入口。</p>"
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>更换头像 · Folio</title>
    <style>
      * {{ box-sizing:border-box }}
      body {{ margin:0; padding:24px; background:#f5f8fe; color:#172944; font:16px/1.6 system-ui,sans-serif }}
      main {{ width:min(100%,480px); margin:8vh auto 0; padding:24px; border:1px solid #d8e3f3; border-radius:16px; background:#fff }}
      h1 {{ margin:0; font-size:1.5rem }}
      img {{ display:block; width:104px; height:104px; object-fit:cover; border-radius:14px; margin:12px 0 }}
      label,input {{ display:block; max-width:100%; margin:8px 0 }}
      button {{ padding:8px 14px; border:0; border-radius:8px; background:#2459cf; color:#fff; font:inherit; cursor:pointer }}
      a {{ display:inline-block; margin-top:16px; color:#214aa7 }}
      [data-error="true"] {{ color:#9b373c }}
    </style>
</head>
<body><main><h1>更换头像</h1>{body}<a href="{path}">返回简历</a></main></body>
</html>""".encode("utf-8")


class PublishedPageStore:
    def __init__(self, directory):
        self.directory = directory

    def publish(self, html, avatar_id=None):
        if not isinstance(html, str) or not html.strip() or "\x00" in html:
            raise ModelError(400, "invalid_page", "当前没有可以发布的 HTML。")
        try:
            data = html.encode("utf-8")
        except UnicodeEncodeError as error:
            raise ModelError(400, "invalid_page", "HTML 中有无法读取的字符。") from error
        if len(data) > MAX_PAGE_BYTES:
            raise ModelError(413, "page_too_large", "HTML 超出 2 MB，请精简后再发布。")
        avatar = self.draft_avatar(avatar_id) if avatar_id is not None else None
        owner = secrets.token_urlsafe(32)

        try:
            self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".publish-", dir=self.directory) as temporary:
                staged = Path(temporary) / "page"
                staged.mkdir(mode=0o700)
                write_atomically(staged / "index.html", data)
                write_atomically(staged / "owner", hashlib.sha256(owner.encode()).hexdigest().encode("ascii"))
                if avatar is not None:
                    write_atomically(staged / "avatar.png", avatar)
                for _ in range(5):
                    page_id = secrets.token_urlsafe(16)
                    if (self.directory / f"{page_id}.html").exists():
                        continue
                    try:
                        staged.rename(self.directory / page_id)
                    except OSError as error:
                        if error.errno in (errno.EEXIST, errno.ENOTEMPTY):
                            continue
                        raise
                    return f"/page/{page_id}", owner
            raise OSError("Could not allocate a unique page ID")
        except OSError as error:
            raise ModelError(500, "publication_failed", "保存发布页面失败，请检查服务端的发布目录。") from error

    def page_file(self, page_id):
        if PAGE_ID.fullmatch(page_id):
            for path in (self.directory / page_id / "index.html", self.directory / f"{page_id}.html"):
                if path.is_file():
                    return path
        raise ModelError(404, "page_not_found", "这个发布链接对应的页面不存在。")

    def read(self, page_id):
        path = self.page_file(page_id)
        try:
            return render_avatar(path.read_bytes(), page_id, self.page_avatar(path))
        except OSError as error:
            raise ModelError(500, "publication_unavailable", "暂时无法读取发布页面。") from error

    def page_avatar_path(self, page):
        return page.with_name("avatar.png") if page.name == "index.html" else page.with_suffix(".avatar.png")

    def page_avatar(self, page):
        try:
            return self.page_avatar_path(page).read_bytes()
        except FileNotFoundError:
            return None
        except OSError as error:
            raise ModelError(500, "avatar_unavailable", "暂时无法读取头像。") from error

    def owns(self, page, token):
        if page.name != "index.html" or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            return False
        try:
            digest = page.with_name("owner").read_text(encoding="ascii")
        except (OSError, UnicodeError):
            return False
        return hmac.compare_digest(digest, hashlib.sha256(token.encode()).hexdigest())

    def replace_avatar(self, page, data):
        validate_avatar(data)
        self.save_avatar_file(self.page_avatar_path(page), data)

    def save_draft_avatar(self, data):
        validate_avatar(data)
        avatar_id = hashlib.sha256(data).hexdigest()
        self.save_avatar_file(self.directory / "avatars" / f"{avatar_id}.png", data)
        return avatar_id

    def draft_avatar(self, avatar_id):
        if isinstance(avatar_id, str) and AVATAR_ID.fullmatch(avatar_id):
            try:
                return (self.directory / "avatars" / f"{avatar_id}.png").read_bytes()
            except FileNotFoundError:
                pass
            except OSError as error:
                raise ModelError(500, "avatar_unavailable", "暂时无法读取头像。") from error
        raise ModelError(404, "avatar_not_found", "没有找到已上传的头像，请重新选择图片。")

    def save_avatar_file(self, path, data):
        try:
            write_atomically(path, data)
        except OSError as error:
            raise ModelError(500, "avatar_save_failed", "保存头像失败，请检查服务端存储目录。") from error
