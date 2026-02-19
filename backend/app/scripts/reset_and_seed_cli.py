from __future__ import annotations

import argparse
import json

from app.scripts.db_reset import reset_all_app_data
from app.scripts.seed_sample_hotel import seed_sample_hotel
from app.scripts.seed_sample_shop import seed_sample_shop
from app.services.role_service import ensure_core_roles
from app.db import SessionLocal


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="reset_and_seed_cli",
        description="DELETE ALL DATA and seed sample data (shop/hotel).",
    )
    p.add_argument(
        "--profile",
        choices=["shop", "hotel", "both"],
        default="shop",
        help="Which sample dataset to seed.",
    )
    p.add_argument(
        "--confirm",
        required=True,
        help='Safety check. Must be exactly: "DELETE_ALL_DATA"',
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    if str(args.confirm).strip() != "DELETE_ALL_DATA":
        raise SystemExit('Refusing to run. Use: --confirm "DELETE_ALL_DATA"')

    reset_all_app_data(destructive_ok=True)

    db = SessionLocal()
    try:
        ensure_core_roles(db)

        if args.profile == "hotel":
            out = {"profile": "hotel", "seed": seed_sample_hotel(db)}
        elif args.profile == "both":
            out = {
                "profile": "both",
                "seed": {
                    "shop": seed_sample_shop(db),
                    "hotel": seed_sample_hotel(db),
                },
            }
        else:
            out = {"profile": "shop", "seed": seed_sample_shop(db)}

        print(json.dumps(out, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()

