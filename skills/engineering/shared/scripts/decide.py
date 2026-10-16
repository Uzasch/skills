"""Ask the OpenAI Decisions API the questions in a request file; print its answers as JSON.

Usage: decide.py request.json   (request: {"text": [...], "images": [paths], "questions": [...]})
Key: env OPENAI_DECISIONS_KEY, else variable DECISIONS_KEY_NAME read from the file DECISIONS_ENV_FILE.
Exit 0 answers printed, 2 bad request file, 3 no key, 4 API failed after retries.
"""
import base64
import json
import mimetypes
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://api.openai.com/v1/decisions"
MODEL = os.environ.get("DECISIONS_MODEL", "gpt-6-luna")
ATTEMPTS = 3
RATE_LIMIT_WAIT_S = 20


def content(text: list[str], images: list[str]) -> list[dict]:
    parts = [{"type": "input_text", "text": t} for t in text]
    for p in images:
        mime = mimetypes.guess_type(p)[0] or "image/png"
        data = base64.b64encode(Path(p).read_bytes()).decode()
        parts.append({"type": "input_image", "image_url": f"data:{mime};base64,{data}"})
    return parts


def ask(body: bytes, key: str) -> list[dict]:
    """POST once per attempt; waits on 429/5xx only, never retries another 4xx."""
    for attempt in range(1, ATTEMPTS + 1):
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["answers"]
        except urllib.error.HTTPError as e:
            retryable = e.code == 429 or e.code >= 500
            if not retryable or attempt == ATTEMPTS:
                raise
            ra = e.headers.get("Retry-After") or ""
            wait = float(ra) if ra.isdigit() else RATE_LIMIT_WAIT_S
        except urllib.error.URLError:
            if attempt == ATTEMPTS:
                raise
            wait = 2 ** attempt
        time.sleep(wait + random.uniform(0, 1))
    raise RuntimeError("unreachable")


def key_from_env_file() -> str | None:
    path, name = os.environ.get("DECISIONS_ENV_FILE"), os.environ.get("DECISIONS_KEY_NAME")
    if not (path and name) or not Path(path).is_file():
        return None
    for line in Path(path).read_text().splitlines():
        k, sep, v = line.removeprefix("export ").partition("=")
        if sep and k.strip() == name:
            return v.strip().strip("'\"") or None
    return None


def main() -> int:
    key = os.environ.get("OPENAI_DECISIONS_KEY") or key_from_env_file()
    if not key:
        print("no Decisions API key: skip the fast check", file=sys.stderr)
        return 3
    try:
        req = json.loads(Path(sys.argv[1]).read_text())
        parts = content(req.get("text", []), req.get("images", []))
        questions = req["questions"]
    except (IndexError, OSError, KeyError, ValueError) as e:
        print(f"bad request file: {e}", file=sys.stderr)
        return 2
    body = json.dumps({"model": MODEL, "input": [{"role": "user", "content": parts}],
                       "questions": questions}).encode()
    try:
        answers = ask(body, key)
    except (urllib.error.URLError, KeyError, ValueError) as e:
        detail = e.read().decode()[:500] if isinstance(e, urllib.error.HTTPError) else str(e)
        print(f"Decisions API failed: {detail}", file=sys.stderr)
        return 4
    print(json.dumps(answers, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
