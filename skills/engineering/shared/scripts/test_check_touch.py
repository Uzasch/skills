"""Run: python3 -I test_check_touch.py   (exit 0 = all pass)"""
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("check-touch.py")
HEAD = "| unit (file:line) | why touched | rule broken (CODING_STANDARDS heading) | size | action | done when |\n|---|---|---|---|---|---|\n"
# Copied from video-compilation2.0 docs/adr/0063-vault-commit-touch.md: an architect table, 5 columns.
ADR_0063 = """| unit (file:line) | why touched | rule broken (CODING_STANDARDS heading) | size | action |
|---|---|---|---|---|
| backend/workers/tasks.py:4068 `apply_sweep_answers` | loop becomes per-decision | Design: SOLID as it applies here (one job per unit) | ~270 lines move to `_carry_out`, ~25 left | fix |
| backend/workers/tasks.py:3299 `_policy_baseline` | docstring no longer true | — (stale words only) | ~5 docstring lines | ok |
"""
CASES = {
    "old 5-column, ok rows only": ("| a.py:1 | x | — | 0 | ok |\n", 0),
    "ADR 0063 table before done when is filled": (ADR_0063, 1),
    "fix with empty done when": (HEAD + "| a.py:1 | x | Design: SOLID | 20 lines | fix ||\n", 1),
    "good 6-column": (HEAD + "| a.py:1 | x | Design: SOLID | 20 lines | fix | table takes <= 7 props |\n"
                      "| b.py:2 | y | — | 0 | ok | |\n", 0),
    "pipe inside a cell": (HEAD + "| a.py:1 | x | Design: SOLID | 20 lines | fix | a | b |\n", None),
}


def run(text: str) -> subprocess.CompletedProcess:
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(text)
    try:
        return subprocess.run([sys.executable, "-I", str(SCRIPT), f.name], capture_output=True, text=True)
    finally:
        Path(f.name).unlink()


failed = 0
for name, (text, want) in CASES.items():
    r = run(text)
    ok = "Traceback" not in r.stderr and (r.returncode == want if want is not None else r.returncode in (0, 1))
    failed += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {name}: exit {r.returncode} {r.stderr.strip()}")
sys.exit(1 if failed else 0)
