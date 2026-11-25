import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from model_api import ModelConfigStore, ModelError, compose_resume, list_models, test_model


ROOT = Path(__file__).resolve().parent.parent
LISTEN_HOST = "0.0.0.0"
JSON_TYPE = "application/json; charset=utf-8"
HTML_TYPE = "text/html; charset=utf-8"
MAX_BODY = 512 * 1024
DEV_ASSETS = {
    "/src/styles.css": "text/css; charset=utf-8",
    "/src/resume.js": "text/javascript; charset=utf-8",
    "/src/model.js": "text/javascript; charset=utf-8",
    "/src/app.js": "text/javascript; charset=utf-8",
    "/assets/hero-filaments.webp": "image/webp",
    "/assets/folio-icon.png": "image/png",
}


class FolioServer(ThreadingHTTPServer):
    def __init__(self, port, built, config_path):
        super().__init__((LISTEN_HOST, port), FolioHandler)
        self.index = ROOT / ("dist/index.html" if built else "index.html")
        self.assets = {} if built else DEV_ASSETS
        self.config = ModelConfigStore(config_path)


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

    def route(self):
        try:
            host = self.headers.get("Host", "").lower()
            address, port = self.connection.getsockname()
            names = {address, "localhost"} if address == "127.0.0.1" else {address}
            allowed_hosts = {f"{name}:{port}" for name in names}
            if port == 80:
                allowed_hosts.update(names)
            if host not in allowed_hosts:
                raise ModelError(403, "invalid_host", "请使用 Folio 服务的 IP 地址打开页面。")
            path = urlsplit(self.path).path
            method = self.command
            if method in ("POST", "PUT"):
                origin = self.headers.get("Origin")
                origin_host = host.split(":", 1)[0] if port == 80 else host
                if origin is not None and origin != "http://" + origin_host:
                    raise ModelError(403, "invalid_origin", "请在 Folio 页面内操作。")

            if path == "/api/model-config":
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

    def read_json(self):
        if self.headers.get_content_type() != "application/json":
            raise ModelError(415, "invalid_content_type", "请求需要使用 JSON 格式。")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_BODY:
                raise ModelError(413, "body_too_large", "当前简历和对话内容太长，请缩短后重试。")
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

    def send_json(self, status, data):
        self.send_bytes(status, JSON_TYPE, json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def send_bytes(self, status, content_type, data):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
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
    args = parser.parse_args()
    if args.built and not (ROOT / "dist/index.html").is_file():
        parser.error("Run npm run build before previewing the build.")
    with FolioServer(args.port, args.built, args.config) as server:
        print(f"Folio  http://127.0.0.1:{server.server_port}/  (listening on {LISTEN_HOST}:{server.server_port})", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
