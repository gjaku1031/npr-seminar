#!/usr/bin/env python3
# 실행: packages/contracts 에서 `python3 scripts/audit_controller_routes.py`(pnpm run validate 에 포함)
# 종료 코드: 0 일치, 1 계약에만 있거나 컨트롤러에만 있는 라우트·중복 라우트·파일 오류
"""NestJS 컨트롤러 라우트와 공개 업무 API 계약(openapi.yaml)의 operation 목록 대조"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from validate_openapi import ContractValidationError, iter_operations, load_contract


# @Controller('경로') 데코레이터
CONTROLLER_RE = re.compile(r"@Controller\(\s*['\"]([^'\"]*)['\"]\s*\)")
# @Get·@Post·@Patch·@Delete·@Put('경로') 데코레이터
OPERATION_RE = re.compile(
    r"@(Get|Post|Patch|Delete|Put)\(\s*(?:['\"]([^'\"]*)['\"])?\s*\)"
)
# Nest 경로 파라미터 :이름
NEST_PARAMETER_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")
# 계약 대상이 아닌 내부 상태 검사 라우트
INTERNAL_ROUTE_ALLOWLIST = {
    ("/health/live", "get"),
    ("/health/ready", "get"),
}


# 컨트롤러 기본 경로와 메서드 경로를 합치고 :이름 을 {이름} 으로 바꿈
def normalize_route(base: str, suffix: str) -> str:
    pieces = [piece.strip("/") for piece in (base, suffix) if piece.strip("/")]
    return NEST_PARAMETER_RE.sub(r"{\1}", "/" + "/".join(pieces))


# apps/api/src 아래 모든 컨트롤러의 (경로, 메서드) → 파일. 같은 라우트가 두 번 나오면 실패
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


# 진입점. 계약 operation 과 컨트롤러 라우트를 양방향으로 대조
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
