#!/usr/bin/env python3
"""Refresh mapped SDL ranks from AREDL's public levels endpoint."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LIST_PATH = DATA_DIR / "_list.json"
RANKS_PATH = DATA_DIR / "_aredl_ranks.json"
API_URL = (
    "https://api.aredl.net/v2/api/aredl/levels"
    "?exclude_legacy=true&exclude_pending=true&exclude_removed=true"
)


def read_json(path: Path):
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def is_two_player(path: str, level: dict) -> bool:
    explicit = level.get("two_player")
    if isinstance(explicit, bool):
        return explicit
    name = str(level.get("name", ""))
    return bool(re.search(r"\(\s*2p\s*\)|2p$", name, re.IGNORECASE)) or bool(
        re.search(r"2p$", path, re.IGNORECASE)
    )


def fetch_aredl_levels() -> list[dict]:
    request = Request(
        API_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "SRDL-AREDL-rank-refresh/1.0",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            levels = json.load(response)
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError(f"AREDL API request failed: {error}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("AREDL API did not return valid JSON.") from error

    if not isinstance(levels, list) or not levels:
        raise RuntimeError("AREDL API returned an empty or unexpected response.")
    return levels


def main() -> int:
    paths = read_json(LIST_PATH)
    rank_map = read_json(RANKS_PATH)
    if not isinstance(paths, list) or not isinstance(rank_map, dict):
        raise RuntimeError("SDL list or AREDL rank map has an unexpected format.")

    missing_map_entries = [path for path in paths if path not in rank_map]
    if missing_map_entries:
        raise RuntimeError(
            "Rank map is missing SDL entries; add a rank or neighbor estimate first: "
            + ", ".join(missing_map_entries)
        )

    # Match by Geometry Dash level ID and 2P status, not by title.
    aredl_by_id: dict[tuple[str, bool], dict] = {}
    for aredl_level in fetch_aredl_levels():
        level_id = aredl_level.get("level_id")
        position = aredl_level.get("position")
        if level_id is None or not isinstance(position, int):
            continue
        key = (str(level_id), bool(aredl_level.get("two_player", False)))
        aredl_by_id[key] = aredl_level

    matched = 0
    changed = 0
    unmatched = []

    for path in paths:
        level = read_json(DATA_DIR / f"{path}.json")
        level_id = level.get("id")
        if level_id is None:
            unmatched.append(f"{path} (missing SDL level ID)")
            continue

        key = (str(level_id), is_two_player(path, level))
        aredl_level = aredl_by_id.get(key)
        if aredl_level is None:
            # Preserve the current rank for unlisted levels and estimates.
            unmatched.append(path)
            continue

        matched += 1
        new_rank = aredl_level["position"]
        entry = rank_map[path]
        if entry.get("rank") != new_rank or entry.get("method") != "AREDL API: level ID":
            entry["rank"] = new_rank
            entry["method"] = "AREDL API: level ID"
            changed += 1

    if matched == 0:
        raise RuntimeError("No SDL levels matched AREDL; rank map was not changed.")

    if changed:
        with RANKS_PATH.open("w", encoding="utf-8", newline="\n") as file:
            json.dump(rank_map, file, ensure_ascii=False, indent=4)
            file.write("\n")

    print(
        f"Matched {matched}/{len(paths)} SDL levels; "
        f"updated {changed} rank-map entries; "
        f"kept {len(unmatched)} existing ranks/estimates."
    )
    if unmatched:
        print("Unmatched (kept as-is): " + ", ".join(unmatched))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
