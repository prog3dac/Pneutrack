"""Server HTTP locale dell'editor (solo libreria standard).

Avvio: ``python -m pneutrack.gui`` oppure ``pneutrack-gui``. Apre il browser su
http://127.0.0.1:8765.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from typing import Any
from urllib.parse import unquote, urlparse

from . import api

MAX_BODY = 5 * 1024 * 1024
_STATIC = resources.files("pneutrack.gui").joinpath("static")


class Handler(BaseHTTPRequestHandler):
    server_version = "Pneutrack"

    def log_message(self, format: str, *args: Any) -> None:  # silenzioso nei test
        if getattr(self.server, "verbose", False):
            super().log_message(format, *args)

    # --- risposte --------------------------------------------------------
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data: Any, status: int = HTTPStatus.OK) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _error(self, status: int, message: str) -> None:
        self._json({"error": message}, status)

    def _body(self) -> Any:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("richiesta troppo grande")
        return json.loads(self.rfile.read(length) or b"{}")

    # --- routing ---------------------------------------------------------
    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/catalog":
            return self._json(api.catalog())
        if path == "/api/examples":
            return self._json(api.list_examples())
        if path.startswith("/api/examples/"):
            try:
                return self._json(api.load_example(path.rsplit("/", 1)[1]))
            except KeyError:
                return self._error(HTTPStatus.NOT_FOUND, "esempio inesistente")
        if path.startswith("/api/"):
            return self._error(HTTPStatus.NOT_FOUND, "endpoint inesistente")
        self._static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            data = self._body()
        except (ValueError, json.JSONDecodeError) as exc:
            return self._error(HTTPStatus.BAD_REQUEST, f"JSON non valido: {exc}")
        if not isinstance(data, dict):
            return self._error(HTTPStatus.BAD_REQUEST, "atteso un oggetto JSON")
        if path == "/api/analyze":
            return self._json(api.analyze(data))
        if path == "/api/cylinder-info":
            try:
                return self._json(api.cylinder_info(data))
            except Exception as exc:  # parametri non validi: il pannello mostra solo nulla
                return self._json({"error": str(exc)})
        self._error(HTTPStatus.NOT_FOUND, "endpoint inesistente")

    def _static(self, path: str) -> None:
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        parts = rel.split("/")
        if any(p in ("", ".", "..") for p in parts):
            return self._error(HTTPStatus.NOT_FOUND, "file inesistente")
        entry = _STATIC.joinpath(*parts)
        if not entry.is_file():
            return self._error(HTTPStatus.NOT_FOUND, "file inesistente")
        ctype = mimetypes.guess_type(rel)[0] or "application/octet-stream"
        if rel.endswith(".js"):
            ctype = "text/javascript"
        if ctype.startswith("text/"):
            ctype += "; charset=utf-8"
        self._send(HTTPStatus.OK, entry.read_bytes(), ctype)


def make_server(host: str = "127.0.0.1", port: int = 8765, verbose: bool = False) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), Handler)
    server.verbose = verbose  # type: ignore[attr-defined]
    return server


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="pneutrack-gui", description="Editor di schemi pneumatici")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="non aprire il browser")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    server = make_server(args.host, args.port, args.verbose)
    url = f"http://{args.host}:{server.server_address[1]}/"
    print(f"Pneutrack in ascolto su {url}  (Ctrl+C per uscire)")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
