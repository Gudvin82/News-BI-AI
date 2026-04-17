from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOTS_PATH = ROOT / "config" / "bots.json"


def load_data() -> dict:
    if not BOTS_PATH.exists():
        return {"bots": []}
    with BOTS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data: dict) -> None:
    with BOTS_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def cmd_list() -> None:
    data = load_data()
    for b in data.get("bots", []):
        token = b.get("token", "")
        masked = token[:8] + "..." if len(token) > 8 else "***"
        print(f"- slug={b.get('slug')} username=@{b.get('username')} scenario={b.get('scenario_slug')} token={masked}")


def cmd_add(args: argparse.Namespace) -> None:
    data = load_data()
    bots = data.setdefault("bots", [])
    if any(b.get("slug") == args.slug for b in bots):
        raise SystemExit(f"Slug '{args.slug}' already exists")

    bots.append(
        {
            "slug": args.slug,
            "token": args.token,
            "display_name": args.display_name,
            "username": args.username,
            "short_description": args.short_description,
            "full_description": args.full_description,
            "scenario_slug": args.scenario_slug,
        }
    )
    save_data(data)
    print(f"Added: {args.slug}")


def cmd_update(args: argparse.Namespace) -> None:
    data = load_data()
    bots = data.get("bots", [])

    target = None
    for b in bots:
        if b.get("slug") == args.slug:
            target = b
            break

    if not target:
        raise SystemExit(f"Slug '{args.slug}' not found")

    if args.token is not None:
        target["token"] = args.token
    if args.username is not None:
        target["username"] = args.username
    if args.display_name is not None:
        target["display_name"] = args.display_name
    if args.short_description is not None:
        target["short_description"] = args.short_description
    if args.full_description is not None:
        target["full_description"] = args.full_description
    if args.scenario_slug is not None:
        target["scenario_slug"] = args.scenario_slug

    save_data(data)
    print(f"Updated: {args.slug}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage bots config")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    add = sub.add_parser("add")
    add.add_argument("--slug", required=True)
    add.add_argument("--token", required=True)
    add.add_argument("--username", required=True)
    add.add_argument("--display-name", required=True)
    add.add_argument("--short-description", required=True)
    add.add_argument("--full-description", required=True)
    add.add_argument("--scenario-slug", required=True)

    upd = sub.add_parser("update")
    upd.add_argument("--slug", required=True)
    upd.add_argument("--token")
    upd.add_argument("--username")
    upd.add_argument("--display-name")
    upd.add_argument("--short-description")
    upd.add_argument("--full-description")
    upd.add_argument("--scenario-slug")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "list":
        cmd_list()
    elif args.command == "add":
        cmd_add(args)
    elif args.command == "update":
        cmd_update(args)


if __name__ == "__main__":
    main()
