import ipaddress
import json
import os
import re
import tempfile
import threading
from dataclasses import dataclass
from http.client import HTTPException
from pathlib import Path
from urllib import request
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit


DEFAULT_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4.1-mini"
UPSTREAM_LIMIT = 1024 * 1024
HTML_LIMIT = 120_000
SYSTEM_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "resume-assistant.md"
INTAKE_PROMPT_PATH = SYSTEM_PROMPT_PATH.with_name("resume-intake.md")


class ModelError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code


def is_loopback(host):
    if host.lower().rstrip(".") == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def clean_endpoint(value):
    url = value.strip().rstrip("/") if isinstance(value, str) else ""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as error:
        raise ModelError(400, "invalid_url", "请填写有效的 API 地址。") from error
    if (
        not parts.hostname or parts.scheme not in {"http", "https"} or port == 0
        or len(url) > 2048 or re.search(r"[\s\\?#\x00-\x1f\x7f]", url)
        or parts.username is not None or parts.password is not None
    ):
        raise ModelError(400, "invalid_url", "请填写有效的 API 地址，例如 https://api.openai.com/v1。")
    if parts.scheme == "http" and not is_loopback(parts.hostname):
        raise ModelError(400, "invalid_url", "远程 API 地址请使用 HTTPS。本机接口可以使用 HTTP。")
    return url


def endpoint_origin(url):
    parts = urlsplit(url)
    return parts.scheme, parts.hostname.lower(), parts.port or (443 if parts.scheme == "https" else 80)


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    model: str
    token: str

    def public(self):
        return {"baseUrl": self.base_url, "model": self.model, "configured": True, "hasToken": bool(self.token)}


class ModelConfigStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()

    def load(self):
        try:
            if self.path.is_symlink():
                raise OSError("Configuration must be a regular file")
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            token = raw["apiToken"]
            base_url = clean_endpoint(raw["baseUrl"])
            model = raw["model"]
            if not valid_model(model) or not valid_token(token) or (not token and not is_loopback(urlsplit(base_url).hostname)):
                raise ValueError("Invalid model configuration")
            return ModelConfig(base_url, model, token)
        except FileNotFoundError:
            return None
        except (OSError, ValueError, TypeError, KeyError, ModelError) as error:
            raise ModelError(500, "config_read_error", "本地模型配置读取失败，请重新填写并保存。") from error

    def status(self):
        config = self.load()
        return config.public() if config else {
            "baseUrl": DEFAULT_URL, "model": DEFAULT_MODEL, "configured": False, "hasToken": False,
        }

    def save(self, data):
        model = data.get("model")
        model = model.strip() if isinstance(model, str) else ""
        if not valid_model(model):
            raise ModelError(400, "invalid_model", "请填写模型 ID。")

        with self.lock:
            base_url, token = self.credentials(data)
            config = ModelConfig(base_url, model, token)
            self.write(config)
        return config.public()

    def credentials(self, data):
        base_url = clean_endpoint(data.get("baseUrl"))
        token = data.get("apiToken", "")
        if isinstance(token, str):
            token = token.strip()
        if not valid_token(token):
            raise ModelError(400, "invalid_token", "API Token 格式无效，请检查是否含空格或换行。")
        if not token:
            old = self.load()
            if old and endpoint_origin(base_url) == endpoint_origin(old.base_url):
                token = old.token
            if not token and not is_loopback(urlsplit(base_url).hostname):
                raise ModelError(400, "token_required", "请填写该 API 地址对应的 Token。")
        return base_url, token

    def write(self, config):
        temp_path = None
        try:
            self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent, delete=False) as temp:
                temp_path = Path(temp.name)
                json.dump({"baseUrl": config.base_url, "model": config.model, "apiToken": config.token}, temp, indent=2, ensure_ascii=False)
                temp.write("\n")
                temp.flush()
                os.fsync(temp.fileno())
            os.replace(temp_path, self.path)
        except OSError as error:
            raise ModelError(500, "config_write_error", "保存失败，请检查本机配置目录的写入权限。") from error
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    def active(self):
        config = self.load()
        if config is None:
            raise ModelError(409, "model_not_configured", "请先保存模型设置。")
        return config


def valid_model(value):
    return isinstance(value, str) and 0 < len(value) <= 140 and not re.search(r"[\s\x00-\x1f\x7f]", value)


def valid_token(value):
    return isinstance(value, str) and bool(re.fullmatch(r"[!-~]{0,4096}", value))


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def provider_endpoint(base_url, resource):
    completions = "/chat/completions"
    if urlsplit(base_url).path.endswith(completions):
        base_url = base_url[:-len(completions)]
    return base_url + resource


def provider_response(endpoint, token, *, payload=None, timeout, error_messages):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    outgoing = request.Request(endpoint, body, headers=headers)
    redirect_policy = NoRedirect()
    if is_loopback(urlsplit(endpoint).hostname):
        opener = request.build_opener(request.ProxyHandler({}), redirect_policy)
    else:
        opener = request.build_opener(redirect_policy)
    try:
        with opener.open(outgoing, timeout=timeout) as response:
            return response.read(UPSTREAM_LIMIT + 1)
    except HTTPError as error:
        status = error.code
        error.close()
        message = error_messages.get(status) or {
            401: "模型服务未通过认证，请检查 API Token。",
            403: "模型服务拒绝访问，请检查 Token 的调用权限。",
            429: "模型服务达到频率或额度限制，请稍后重试。",
        }.get(status, "模型服务返回错误，请检查 API 地址或稍后重试。")
        raise ModelError(502, "upstream_rejected", message) from error
    except (OSError, ValueError, HTTPException) as error:
        reason = error.reason if isinstance(error, URLError) else error
        if isinstance(reason, TimeoutError):
            raise ModelError(504, "upstream_timeout", "模型响应超时，请重试。") from error
        raise ModelError(502, "upstream_unreachable", "无法连接模型服务，请检查 API 地址和网络。") from error


def list_models(base_url, token):
    unavailable = "此 API 地址未提供模型列表，可以手动填写模型 ID。"
    payload = provider_response(
        provider_endpoint(base_url, "/models"), token, timeout=15,
        error_messages={404: unavailable, 405: unavailable, 501: unavailable},
    )
    try:
        if len(payload) > UPSTREAM_LIMIT:
            raise ValueError("Response exceeded size limit")
        models = json.loads(payload)["data"]
        if not isinstance(models, list):
            raise ValueError("Expected a list of models")
    except (ValueError, TypeError, KeyError, RecursionError) as error:
        raise ModelError(502, "invalid_model_list", "模型列表格式无法读取，可以手动填写模型 ID。") from error

    ids = set()
    for item in models:
        model_id = item.get("id") if isinstance(item, dict) else None
        if valid_model(model_id) and model_id != token and (len(token) < 12 or token not in model_id):
            ids.add(model_id)
    return {"models": sorted(ids, key=lambda item: (item.casefold(), item))}


def read_completion(config, messages):
    payload = provider_response(
        provider_endpoint(config.base_url, "/chat/completions"), config.token,
        payload={"model": config.model, "messages": messages, "stream": False}, timeout=85,
        error_messages={
            400: "模型服务拒绝了请求，请检查模型 ID 和 Chat Completions 接口支持情况。",
            404: "找不到模型或接口，请检查 API 地址和模型 ID。",
        },
    )
    try:
        if len(payload) > UPSTREAM_LIMIT:
            raise ValueError("Response exceeded size limit")
        message = json.loads(payload)["choices"][0]["message"]
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(item["text"] for item in content if isinstance(item, dict) and isinstance(item.get("text"), str))
        if not isinstance(content, str) or not content.strip():
            raise ValueError("No model text")
        # Ignore accidental short-token matches in unrelated response text.
        if config.token and (content.strip() == config.token or "Bearer " + config.token in content):
            raise ValueError("Unexpected credential in response")
        return content.strip()
    except (ValueError, TypeError, IndexError, KeyError, AttributeError, RecursionError) as error:
        raise ModelError(502, "invalid_completion", "模型服务返回了无法读取的内容。") from error


def test_model(config):
    read_completion(config, [{"role": "user", "content": "Reply with OK."}])
    return {"ok": True}


def read_resume_prompt(path):
    try:
        prompt = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        raise ModelError(500, "prompt_read_error", f"读取简历提示词失败，请检查 prompts/{path.name}。") from error
    if not prompt:
        raise ModelError(500, "prompt_empty", f"简历提示词为空，请填写 prompts/{path.name}。")
    return prompt


def follow_up_questions(value):
    if not isinstance(value, list):
        return []
    questions = []
    for item in value:
        if not isinstance(item, str):
            continue
        question = " ".join(item.split())
        if question and question not in questions:
            questions.append(question)
        if len(questions) == 3:
            break
    return questions


def compose_resume(config, data):
    message = data.get("message")
    profile = data.get("profile")
    history = data.get("history", [])
    source = data.get("html")
    source_edited = data.get("sourceEdited", False)
    correction = data.get("formatCorrection")
    phase = data.get("phase")
    if not isinstance(message, str) or not message.strip() or len(message) > 20000 or not isinstance(profile, dict) or not isinstance(history, list):
        raise ModelError(400, "invalid_chat", "请检查要发送的简历内容。")
    if not isinstance(source_edited, bool) or (source_edited and not source):
        raise ModelError(400, "invalid_chat", "当前 HTML 源码没有随对话发送。")
    if source is not None and (not isinstance(source, str) or len(source) > HTML_LIMIT or "\x00" in source):
        raise ModelError(400, "invalid_html", "当前 HTML 无法发送。请检查内容或精简源码后重试。")
    if correction is not None and (not isinstance(correction, str) or len(correction) > 96 or not re.fullmatch(r"html|patch(?:\.[a-zA-Z]+){0,4}", correction)):
        raise ModelError(400, "invalid_chat", "修正格式请求无效。")
    if phase is not None and phase not in ("initial", "revision"):
        raise ModelError(400, "invalid_chat", "无法识别当前简历的处理阶段。")
    if phase is None:
        has_content = source is not None or any(profile.get(key) for key in ("name", "role", "summary", "experience", "projects", "education"))
        phase = "revision" if has_content else "initial"
    recent = [
        {"role": item["role"], "content": item["content"][:2000]}
        for item in history[-8:]
        if isinstance(item, dict) and item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str)
    ]
    context = {"phase": phase, "currentProfile": profile, "recentMessages": recent, "latestRequest": message}
    if source is not None:
        context.update({"currentHtml": source, "sourceEdited": source_edited})
    if correction is not None:
        context["formatCorrection"] = correction
    prompt = "\n\n".join(read_resume_prompt(path) for path in (SYSTEM_PROMPT_PATH, INTAKE_PROMPT_PATH))
    text = read_completion(config, [
        {"role": "system", "content": prompt},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
    ])
    text = re.sub(r"^\x60{3}(?:json)?\s*|\s*\x60{3}$", "", text, flags=re.IGNORECASE)
    try:
        result = json.loads(text)
        if not isinstance(result, dict):
            raise ValueError("Expected a response object")
        reply, patch, html = result.get("reply"), result.get("patch"), result.get("html")
        if html is not None:
            if not isinstance(html, str) or not html.strip() or len(html) > HTML_LIMIT or "\x00" in html:
                raise ValueError("Invalid HTML")
            if patch is None:
                patch = {}
        if not isinstance(reply, str) or not reply.strip() or not isinstance(patch, dict):
            raise ValueError("Missing reply or patch")
        output = {"reply": reply.strip(), "patch": patch}
        questions = follow_up_questions(result.get("questions"))
        if questions:
            output["questions"] = questions
        if html is not None:
            output["html"] = html.strip()
        if len(config.token) >= 12 and config.token in json.dumps(output, ensure_ascii=False):
            raise ValueError("Unexpected credential in result")
        return output
    except (ValueError, TypeError, KeyError, RecursionError) as error:
        raise ModelError(502, "invalid_model_output", "模型没有返回可用的简历数据。可以重试，或换一个模型。") from error
