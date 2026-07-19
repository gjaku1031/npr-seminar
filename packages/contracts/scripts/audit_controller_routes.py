#!/usr/bin/env python3
"""Compare NestJS controller routes with the public business API contract."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from validate_openapi import ContractValidationError, iter_operations, load_contract


CONTROLLER_RE = re.compile(r"@Controller\(\s*['\"]([^'\"]*)['\"]\s*\)")
OPERATION_RE = re.compile(
    r"@(Get|Post|Patch|Delete|Put)\(\s*(?:['\"]([^'\"]*)['\"])?\s*\)"
)
NEST_PARAMETER_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")
INTERNAL_ROUTE_ALLOWLIST = {
    ("/health/live", "get"),
    ("/health/ready", "get"),
}


def normalize_route(base: str, suffix: str) -> str:
    pieces = [piece.strip("/") for piece in (base, suffix) if piece.strip("/")]
    return NEST_PARAMETER_RE.sub(r"{\1}", "/" + "/".join(pieces))


def controller_routes(source_root: Path) -> dict[tuple[str, str], Path]:
    routes: dict[tuple[str, str], Path] = {}
    for source in sorted(source_root.rglob("*controller.ts")):
        text = source.read_text(encoding="utf-8")
        controller = CONTROLLER_RE.search(text)
        if controller is None:
            continue
        for match in OPERATION_RE.finditer(text):
            route = normalize_route(controller.group(1), match.group(2) or "")
            key = (route, match.group(1).casefold())
            if key in routes:
                raise ContractValidationError(
                    f"duplicate NestJS controller route {key}: {routes[key]} and {source}"
                )
            routes[key] = source
    return routes


def main() -> int:
    repository = Path(__file__).resolve().parents[3]
    contract_path = repository / "packages/contracts/openapi.yaml"
    controller_root = repository / "apps/api/src"
    try:
        document = load_contract(contract_path)
        contracted = {
            (path, method)
            for path, method, _operation, _path_item in iter_operations(document)
        }
        implemented = controller_routes(controller_root)
        public_implemented = set(implemented) - INTERNAL_ROUTE_ALLOWLIST
        missing_contract = sorted(public_implemented - contracted)
        missing_controller = sorted(contracted - public_implemented)
        if missing_contract or missing_controller:
            details: list[str] = []
            if missing_contract:
                details.append(
                    "controller-only: "
                    + ", ".join(f"{method.upper()} {path}" for path, method in missing_contract)
                )
            if missing_controller:
                details.append(
                    "contract-only: "
                    + ", ".join(f"{method.upper()} {path}" for path, method in missing_controller)
                )
            raise ContractValidationError("; ".join(details))
    except (ContractValidationError, OSError) as exc:
        print(f"Controller route audit failed: {exc}", file=sys.stderr)
        return 1

    print(
        "Controller route audit passed: "
        f"{len(contracted)} contracted business operations; "
        f"{len(INTERNAL_ROUTE_ALLOWLIST)} allowlisted health operations"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
