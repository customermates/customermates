"""Python harness: exposes a read-only `crm` client to the user program, runs it,
and prints a sentinel line with {status, result, error}. No secrets are present;
the only reachable network destination is the broker (enforced by the network)."""

import json
import os
import sys
import traceback
import urllib.error
import urllib.request

_BROKER = os.environ.get("SANDBOX_BROKER_URL", "")
_TOKEN = os.environ.get("SANDBOX_RUN_TOKEN", "")


class _Crm:
    def _call(self, operation, params):
        data = json.dumps({"operation": operation, "params": params}).encode("utf-8")
        req = urllib.request.Request(
            _BROKER,
            data=data,
            method="POST",
            headers={"content-type": "application/json", "x-sandbox-token": _TOKEN},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
        except urllib.error.HTTPError as http_err:
            # The broker returns a JSON {ok:false, error} even on 4xx (e.g. read-only
            # refusal, per-run cap, validation). Read it so the real reason surfaces
            # instead of a bare "HTTP Error 400" (lets the agent self-correct).
            body = http_err.read().decode("utf-8")
        payload = json.loads(body)
        if not payload.get("ok"):
            raise RuntimeError("broker error: " + str(payload.get("error", "unknown")))
        return payload["data"]

    def list(self, entity, **kwargs):
        return self._call("list", {"entity": entity, **kwargs})

    def count(self, entity, **kwargs):
        return self._call("count", {"entity": entity, **kwargs})

    def search(self, search_term, **kwargs):
        return self._call("search", {"searchTerm": search_term, **kwargs})

    def get(self, entity, id):
        return self._call("get", {"entity": entity, "id": id})

    def configuration(self, entity):
        return self._call("configuration", {"entity": entity})

    def run_tool(self, name, args=None):
        """Invoke a backend tool by name (e.g. "filter_entity", "create_entities",
        "update_entities", "delete_entities") with args, executed server-side with the
        user's permissions. Returns the tool's text output. READ-ONLY by default;
        mutating tools require the run_code call to set allowWrite=true (else the broker
        refuses them). Mutations are real — use deliberately."""
        return self._call("tool", {"name": name, "args": args or {}})


crm = _Crm()
result = None
_status = "ok"
_error = None

try:
    with open(os.environ["USER_FILE"], "r", encoding="utf-8") as _f:
        _src = _f.read()
    exec(compile(_src, "<user>", "exec"), globals())
except Exception as _e:  # noqa: BLE001 - report any user error back to the agent
    _status = "error"
    _error = {"message": str(_e), "traceback": traceback.format_exc()}


def _jsonable(value):
    try:
        json.dumps(value)
        return value
    except Exception:  # noqa: BLE001
        return repr(value)


sys.stdout.flush()
print("\n__SANDBOX_RESULT__" + json.dumps({"status": _status, "result": _jsonable(result), "error": _error}))
