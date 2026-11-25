import argparse
import base64
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import CookieError, SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit

from model_api import ModelConfigStore, ModelError, compose_resume, is_loopback, list_models, test_model
from published_pages import MAX_AVATAR_BYTES, MAX_PAGE_BYTES, PublishedPageStore, avatar_editor_html


ROOT = Path(__file__).resolve().parent.parent
LISTEN_HOST = "0.0.0.0"
JSON_TYPE = "application/json; charset=utf-8"
HTML_TYPE = "text/html; charset=utf-8"
MAX_BODY = 512 * 1024
PUBLISHED_PAGE_HEADERS = {
    "Content-Security-Policy": (
        "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; "
        "style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; "
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}
AVATAR_EDITOR_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'none'; script-src 'self'; connect-src 'self'; img-src data: blob:; "
        "style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}
DEV_ASSETS = {
    "/src/styles.css": "text/css; charset=utf-8",
    "/src/resume.js": "text/javascript; charset=utf-8",
    "/src/model.js": "text/javascript; charset=utf-8",
    "/src/app.js": "text/javascript; charset=utf-8",
    "/src/avatar.js": "text/javascript; charset=utf-8",
    "/assets/hero-filaments.webp": "image/webp",
    "/assets/folio-icon.png": "image/png",
    "/assets/editor.js": "text/javascript; charset=utf-8",
}


class FolioServer(ThreadingHTTPServer):
    def __init__(self, port, built, config_path, *, public_url=None, access_password=None, pages_dir=None):
        self.public_origin = None
        self.public_host = None
        self.public_credentials = None
        if public_url:
            url = urlsplit(public_url)
            if url.scheme != "https" or not url.hostname or url.username is not None or url.path not in ("", "/") or url.query or url.fragment:
                raise ValueError("RENDER_EXTERNAL_URL must be an HTTPS origin.")
            if not access_password:
                raise ValueError("Set FOLIO_ACCESS_PASSWORD for the public service.")
            self.public_host = url.netloc.lower()
            self.public_origin = "https://" + self.public_host
            self.public_credentials = base64.b64encode(("folio:" + access_password).encode("utf-8"))
        super().__init__((LISTEN_HOST, port), FolioHandler)
        self.index = ROOT / ("dist/index.html" if built else "index.html")
        self.assets = {} if built else DEV_ASSETS
        self.config = ModelConfigStore(config_path)
        self.pages = PublishedPageStore(pages_dir if pages_dir is not None else config_path.parent / "pages")


class FolioHandler(BaseHTTPRequestHandler):
    timeout = 15

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route()

    def do_POST(self):
        self.route()

    def do_PUT(self):
        self.route()

    def request_origin(self):
        host = self.headers.get("Host", "").lower()
        if self.server.public_origin:
            if host != self.server.public_host:
                raise ModelError(403, "invalid_host", "请使用 Folio 的 Render 服务地址打开页面。")
            return self.server.public_origin
        address, port = self.connection.getsockname()
        names = {address, "localhost"} if address == "127.0.0.1" else {address}
        allowed_hosts = {f"{name}:{port}" for name in names}
        if port == 80:
            allowed_hosts.update(names)
        if host not in allowed_hosts:
            raise ModelError(403, "invalid_host", "请使用 Folio 服务的 IP 地址打开页面。")
        return "http://" + (host.split(":", 1)[0] if port == 80 else host)

    def route(self):
        try:
            path = urlsplit(self.path).path
            method = self.command
            if path == "/healthz" and method in ("GET", "HEAD"):
                self.send_json(200, {"ok": True})
                return

            expected_origin = self.request_origin()
            if path.startswith("/page/"):
                page_id, slash, action = path.removeprefix("/page/").partition("/")
                if slash and action == "avatar" and method in ("GET", "HEAD", "POST"):
                    self.manage_page_avatar(page_id, expected_origin)
                    return
                if not slash and method in ("GET", "HEAD"):
                    self.send_bytes(200, HTML_TYPE, self.server.pages.read(page_id), PUBLISHED_PAGE_HEADERS)
                    return
                raise ModelError(404, "page_not_found", "这个发布链接对应的页面不存在。")

            if method in ("GET", "HEAD"):
                if path == "/folio-avatar.js":
                    self.send_asset(ROOT / "src/avatar.js", "text/javascript; charset=utf-8")
                    return
                if path == "/favicon.ico":
                    self.send_asset(ROOT / "assets/folio-icon.png", "image/png")
                    return

            if self.server.public_credentials is not None and not self.authorized_workspace():
                self.send_json(
                    401, {"code": "access_required", "message": "请输入 Folio 服务的访问密码。"},
                    {"WWW-Authenticate": 'Basic realm="Folio", charset="UTF-8"'},
                )
                return
            if method in ("POST", "PUT"):
                origin = self.headers.get("Origin")
                if origin is not None and origin != expected_origin:
                    raise ModelError(403, "invalid_origin", "请在 Folio 页面内操作。")

            if method == "POST" and path == "/api/publish":
                body = self.read_json(limit=2 * MAX_PAGE_BYTES, brief="HTML 超出 2 MB，请精简后再发布。")
                page_path, owner = self.server.pages.publish(body.get("html"), body.get("avatarId"))
                cookie = f"folio_avatar_owner={owner}; Path={page_path}/avatar; Max-Age=31536000; HttpOnly; SameSite=Lax"
                if expected_origin.startswith("https://"):
                    cookie += "; Secure"
                self.send_json(201, {"path": page_path}, {"Location": page_path, "Set-Cookie": cookie})
                return
            elif method == "POST" and path == "/api/avatars":
                avatar_id = self.server.pages.save_draft_avatar(self.read_avatar())
                self.send_json(201, {"id": avatar_id})
                return
            elif method in ("GET", "HEAD") and path.startswith("/api/avatars/"):
                data = self.server.pages.draft_avatar(path.removeprefix("/api/avatars/"))
                self.send_bytes(200, "image/png", data)
                return
            elif path == "/api/model-config":
                if method in ("GET", "HEAD"):
                    self.send_json(200, self.server.config.status())
                    return
                if method == "PUT":
                    self.send_json(200, self.server.config.save(self.read_json()))
                    return
            elif method == "POST" and path == "/api/models":
                base_url, token = self.server.config.credentials(self.read_json())
                self.send_json(200, list_models(base_url, token))
                return
            elif method == "POST" and path in ("/api/model-test", "/api/chat"):
                body = self.read_json()
                config = self.server.config.active()
                result = test_model(config) if path == "/api/model-test" else compose_resume(config, body)
                self.send_json(200, result)
                return
            elif method in ("GET", "HEAD"):
                if path in ("/", "/index.html"):
                    self.send_asset(self.server.index, HTML_TYPE)
                    return
                if path in self.server.assets:
                    self.send_asset(ROOT / path.lstrip("/"), self.server.assets[path])
                    return
            raise ModelError(404, "not_found", "没有找到这个页面。")
        except ModelError as error:
            self.send_json(error.status, {"code": error.code, "message": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return

    def authorized_workspace(self):
        scheme, _, credentials = self.headers.get("Authorization", "").partition(" ")
        expected = self.server.public_credentials
        return expected is not None and scheme.lower() == "basic" and hmac.compare_digest(credentials.encode("utf-8"), expected)

    def manage_page_avatar(self, page_id, expected_origin):
        store = self.server.pages
        page = store.page_file(page_id)
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get("Cookie", ""))
        except CookieError:
            cookies.clear()
        owner = cookies.get("folio_avatar_owner")
        local = self.server.public_origin is None and is_loopback(self.client_address[0])
        allowed = local or self.authorized_workspace() or (owner is not None and store.owns(page, owner.value))
        if self.command == "POST":
            if not allowed:
                raise ModelError(403, "avatar_not_allowed", "请在发布该网页的浏览器里更换头像。")
            if self.headers.get("Origin") != expected_origin:
                raise ModelError(403, "invalid_origin", "请在头像更换页面内操作。")
            store.replace_avatar(page, self.read_avatar())
            self.send_json(200, {"ok": True})
        else:
            data = store.page_avatar(page) if allowed else None
            self.send_bytes(200 if allowed else 403, HTML_TYPE, avatar_editor_html(page_id, data, allowed), AVATAR_EDITOR_HEADERS)

    def read_avatar(self):
        if self.headers.get_content_type() != "image/png":
            raise ModelError(415, "invalid_avatar", "头像格式不正确，请重新选择图片。")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_AVATAR_BYTES:
                raise ModelError(413, "avatar_too_large", "头像超出 3 MB，请选择较小的图片。")
            if length < 1:
                raise ValueError("Missing image body")
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError("Incomplete image body")
            return data
        except (ValueError, TimeoutError) as error:
            raise ModelError(400, "invalid_avatar", "无法读取头像，请重新选择图片。") from error

    def read_json(self, *, limit=MAX_BODY, brief="当前简历和对话内容太长，请缩短后重试。"):
        if self.headers.get_content_type() != "application/json":
            raise ModelError(415, "invalid_content_type", "请求需要使用 JSON 格式。")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > limit:
                raise ModelError(413, "body_too_large", brief)
            if length < 1:
                raise ValueError("Missing request body")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Expected JSON object")
            return payload
        except (ValueError, RecursionError, TimeoutError) as error:
            raise ModelError(400, "invalid_json", "无法读取请求内容。") from error

    def send_asset(self, path, content_type):
        try:
            data = path.read_bytes()
        except OSError as error:
            raise ModelError(404, "missing_asset", "页面文件不存在，预览部署版前请运行 npm run build。") from error
        self.send_bytes(200, content_type, data)

    def send_json(self, status, data, headers=None):
        self.send_bytes(status, JSON_TYPE, json.dumps(data, ensure_ascii=False).encode("utf-8"), headers)

    def send_bytes(self, status, content_type, data, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def log_request(self, code="-", size="-"):
        # Do not put raw URLs, headers, or request bodies in local access logs.
        self.log_message("%s %s", self.command, code)


def main():
    parser = argparse.ArgumentParser(description="Run Folio and its model API.")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--built", action="store_true")
    parser.add_argument("--config", type=Path, default=ROOT / ".folio" / "model.json")
    parser.add_argument(
        "--pages-dir", type=Path, default=os.environ.get("FOLIO_PAGES_DIR") or None,
        help="Store published HTML in this directory (default: pages next to the model config).",
    )
    args = parser.parse_args()
    if args.built and not (ROOT / "dist/index.html").is_file():
        parser.error("Run npm run build before previewing the build.")
    public_url = os.environ.get("RENDER_EXTERNAL_URL")
    if os.environ.get("RENDER") == "true" and not public_url:
        parser.error("Run Folio as a Render Web Service with RENDER_EXTERNAL_URL.")
    try:
        application = FolioServer(
            args.port, args.built, args.config,
            public_url=public_url, access_password=os.environ.get("FOLIO_ACCESS_PASSWORD"), pages_dir=args.pages_dir,
        )
    except ValueError as error:
        parser.error(str(error))
    with application as server:
        address = server.public_origin or f"http://127.0.0.1:{server.server_port}/"
        print(f"Folio  {address}  (listening on {LISTEN_HOST}:{server.server_port})", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
