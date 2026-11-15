"""The keep-warm loop must check the verdict as well as the HTTP status."""

import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "keep_warm.sh"


@pytest.mark.parametrize(
    ("status", "body", "partial", "message"),
    [
        (200, b'{"verified":true}', False, "Step check verified the sample."),
        (200, b'{"verified":false}', False, "step check did not verify the sample"),
        (200, b'{"verified":"true"}', False, "step check did not verify the sample"),
        (200, b'not a JSON response', False, "step check did not verify the sample"),
        (503, b'private error detail', False, "step check request failed"),
        (200, b'{"verified":true}', True, "step check request failed"),
    ],
)
def test_keep_warm_reports_step_check_verdict(tmp_path, status, body, partial, message):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append((self.path, None))
            self.reply(200, b'{"ok":true}')

        def do_POST(self):
            payload = self.rfile.read(int(self.headers["Content-Length"]))
            requests.append((self.path, json.loads(payload)))
            self.reply(status, body, 1 if partial else 0)

        def reply(self, status, body, missing_bytes=0):
            self.send_response(status)
            self.send_header("Content-Length", str(len(body) + missing_bytes))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    # End the loop following its first pair of requests without waiting a minute.
    commands = {
        "date": 'if [ -f "$WARM_TEST_FINISHED" ]; then echo 60; else echo 0; fi',
        "sleep": ': > "$WARM_TEST_FINISHED"',
    }
    for name, command in commands.items():
        executable = tmp_path / name
        executable.write_text(f"#!/bin/sh\n{command}\n")
        executable.chmod(0o755)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05})
        thread.start()
        try:
            result = subprocess.run(
                ["/bin/bash", str(SCRIPT)],
                env={
                    **os.environ,
                    "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}",
                    "WARM_TEST_FINISHED": str(tmp_path / "finished"),
                    "API": f"http://127.0.0.1:{server.server_port}",
                    "MINUTES": "1",
                    "EVERY": "1",
                },
                capture_output=True, text=True, timeout=8, check=True,
            )
        finally:
            server.shutdown()
            thread.join()

    assert message in result.stdout
    assert "private error detail" not in result.stdout
    assert ("Step check verified the sample." in result.stdout) == (message == "Step check verified the sample.")
    assert requests == [
        ("/api/health", None),
        ("/api/diff", {"from_latex": "2x + 3 = 11", "to_latex": "2x = 8", "mode": "homework"}),
    ]
