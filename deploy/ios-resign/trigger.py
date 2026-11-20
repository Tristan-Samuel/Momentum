#!/usr/bin/env python3
"""Let the iPhone ask the Pi to install Momentum immediately.

Listens on the home LAN only. It writes a force flag and starts the resign
service. It does not see the Apple ID password.
"""

from __future__ import annotations

import ipaddress
import json
import subprocess
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765
FORCE = Path("/var/lib/momentum-resign/force")
STATUS = Path("/var/lib/momentum-resign/status.json")


def peer_allowed(ip: str) -> bool:
    """Home-network peers only. Tailscale CGNAT and public addresses are refused."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return addr.is_private or addr.is_loopback


def request_install(force: Path = FORCE, status: Path = STATUS) -> str:
    force.parent.mkdir(parents=True, exist_ok=True)
    force.write_text("1\n")
    force.chmod(0o600)
    started = datetime.now(timezone.utc).isoformat()
    payload = json.dumps({"action": "requested", "reason": "update requested", "at": started})
    temporary = status.with_suffix(status.suffix + ".tmp")
    temporary.write_text(payload + "\n")
    temporary.replace(status)
    subprocess.run(
        ["systemctl", "start", "--no-block", "momentum-resign.service"],
        check=False,
    )
    return started


def read_status(path: Path = STATUS) -> dict:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError):
        return {"action": "unknown", "reason": "", "at": ""}
    if not isinstance(data, dict):
        return {"action": "unknown", "reason": "", "at": ""}
    return {
        "action": str(data.get("action") or "unknown"),
        "reason": str(data.get("reason") or ""),
        "at": str(data.get("at") or ""),
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("momentum-update: " + (fmt % args) + "\n")

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _refuse_foreign(self) -> bool:
        peer = self.client_address[0]
        if peer_allowed(peer):
            return False
        self._send(403, {"ok": False, "message": "refused"})
        return True

    def do_OPTIONS(self) -> None:
        if self._refuse_foreign():
            return
        self._send(204, {})

    def do_GET(self) -> None:
        if self._refuse_foreign():
            return
        if self.path.split("?", 1)[0] != "/status":
            self._send(404, {"ok": False, "message": "not found"})
            return
        self._send(200, read_status())

    def do_POST(self) -> None:
        if self._refuse_foreign():
            return
        if self.path.split("?", 1)[0] != "/update":
            self._send(404, {"ok": False, "message": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length:
            self.rfile.read(min(length, 4096))
        started = request_install()
        self._send(200, {"ok": True, "message": "installing", "at": started})


class DualStackServer(ThreadingHTTPServer):
    address_family = __import__("socket").AF_INET6
    daemon_threads = True

    def server_bind(self) -> None:
        import socket

        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def serve(port: int = PORT) -> None:
    try:
        httpd: ThreadingHTTPServer = DualStackServer(("::", port), Handler)
    except OSError:
        httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    httpd.serve_forever()


def main() -> int:
    serve(PORT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
