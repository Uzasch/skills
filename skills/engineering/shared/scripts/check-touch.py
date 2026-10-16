"""Refuse a touch table that is missing, empty, or has a row with no verdict.

Usage: check-touch.py <touch.md>   Exit 0 ok, 1 refused (reasons on stderr).
A row passes when its action is ok, or is fix/file and it names the rule it breaks.
"""
import sys
from pathlib import Path

ACTIONS = {"ok", "fix", "file"}


def rows(text: str) -> list[list[str]]:
    out = []
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or set(line) <= set("|-: ") or cells[0].startswith("unit"):
            continue
        out.append(cells)
    return out


def problems(text: str) -> list[str]:
    found = rows(text)
    if not found:
        return ["no rows: list every touched unit, even when all are ok"]
    bad = []
    for unit, _why, rule, _size, action, *_ in found:
        action = action.strip("`").lower()
        if action not in ACTIONS:
            bad.append(f"{unit}: action '{action}' is not ok/fix/file")
        elif action != "ok" and not rule.strip("`-— "):
            bad.append(f"{unit}: '{action}' names no CODING_STANDARDS rule")
    return bad


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not path or not path.is_file():
        print(f"refused: touch table not found ({path})", file=sys.stderr)
        return 1
    bad = problems(path.read_text())
    for b in bad:
        print(f"refused: {b}", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
