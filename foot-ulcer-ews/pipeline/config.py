"""Loads config.json (the single source of truth for every threshold)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"


def load_config(path: Path = CONFIG_PATH) -> dict:
    with open(path) as f:
        return json.load(f)


CONFIG = load_config()
SITES = CONFIG["sites"]
FEET = ("L", "R")
