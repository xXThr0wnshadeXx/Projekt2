import io
import json
from urllib.error import HTTPError

from eval import run_spoken_eval


def test_spoken_report_excludes_provider_errors_from_latency(monkeypatch):
    fixtures = {
        "unambiguous": [{"text": "one", "latex": "1"}, {"text": "two", "latex": "2"}],
        "ambiguous": [{"text": "x plus one over two"}],
    }

    def request(request, timeout):
        phrase = json.loads(request.data)["text"]
        if phrase != "one":
            raise HTTPError(request.full_url, 502, "model unavailable", {}, None)
        return io.BytesIO(b'{"latex":"1","ambiguous":false,"valid":true,"readback":"one"}')

    monkeypatch.setattr(run_spoken_eval, "urlopen", request)
    report = run_spoken_eval.evaluate("http://localhost", fixtures)
    assert report["unambiguous"]["rate"] == 0.5
    assert report["unambiguous"]["request_failures"] == 1
    assert report["unambiguous"]["p50_ms"] == report["unambiguous"]["cases"][0]["ms"]
    assert report["ambiguous"]["p50_ms"] is None
