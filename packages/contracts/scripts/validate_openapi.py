#!/usr/bin/env python3
"""Dependency-light structural validation for the NPR Seminar OpenAPI contract."""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

import yaml


HTTP_METHODS = {
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
}
MUTATING_METHODS = {"put", "post", "delete", "patch"}
PATH_PARAMETER_RE = re.compile(r"{([^{}]+)}")
PAIRING_CODE_PATTERN = r"^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$"
PROBLEM_REQUIRED = {
    "type",
    "title",
    "status",
    "detail",
    "instance",
    "code",
    "traceId",
}
CRITICAL_OPERATION_IDS = {
    "getCsrfToken",
    "loginProjectSession",
    "logoutProjectSession",
    "getCurrentActor",
    "requestOtpChallenge",
    "verifyOtpChallenge",
    "listPublicSeminarSessions",
    "searchAuthorizedStudents",
    "listOwnedFamilyBookings",
    "createPublicFamilyBooking",
    "getPublicFamilyBooking",
    "updatePublicFamilyBooking",
    "cancelPublicFamilyBooking",
    "submitFamilyBookingSurveyResponse",
    "listSessionSurveyResponses",
    "listAdminSeminarSessions",
    "listAdminStudents",
    "listAdminStudentsReviewRequired",
    "getAdminStudent",
    "listAdminStudentHistory",
    "getStudentSyncStatus",
    "listStudentSyncRuns",
    "getStudentSyncRun",
    "runStudentSyncManually",
    "createInitialSnapshotDryRun",
    "publishInitialSnapshot",
    "resetStudentSyncCircuit",
    "listAdminFamilyBookings",
    "getAdminSessionRoster",
    "exportAdminSessionRosterXlsx",
    "getAdminSessionOperationsSummary",
    "getAdminSessionStatistics",
    "createAdminFamilyBooking",
    "getAdminFamilyBooking",
    "updateAdminFamilyBooking",
    "cancelAdminFamilyBooking",
    "listFamilyBookingEvents",
    "listFamilyCheckInEvents",
    "rotateFamilyBookingQr",
    "revokeFamilyBookingQr",
    "listAdminCheckInEvents",
    "createScannerPairingCode",
    "cancelScannerPairingCode",
    "claimScannerPairingCode",
    "listScannerDevices",
    "deleteScannerDevice",
    "revokeScannerDevice",
    "getCurrentScanner",
    "unpairCurrentScanner",
    "sendScannerHeartbeat",
    "getCurrentScannerShift",
    "createScannerShiftLock",
    "releaseScannerShiftLock",
    "listScannerManualCandidates",
    "checkInFamilyByQr",
    "checkInFamilyManually",
    "listScannerDeviceEvents",
    "listStudentSyncEvents",
    "listStudentSyncCircuitEvents",
    "getSmsGatewayReadiness",
    "listSmsTemplates",
    "createSmsTemplate",
    "getSmsTemplate",
    "updateSmsTemplate",
    "archiveSmsTemplate",
    "previewSmsTargets",
    "enqueueSmsSend",
    "enqueueSurveySmsSend",
    "listSmsMessages",
    "getSmsMessage",
    "getGoogleSheetsReadiness",
    "listGoogleSheetsMappings",
    "listGoogleSheetsDeliveries",
    "getGoogleSheetsDelivery",
}
AUDIT_OPERATION_IDS = {
    "listFamilyBookingEvents",
    "listAdminCheckInEvents",
    "listAdminStudentHistory",
    "listStudentSyncEvents",
    "listStudentSyncCircuitEvents",
    "listScannerDeviceEvents",
    "getSmsMessage",
    "getGoogleSheetsDelivery",
}
EXPECTED_CHECK_IN_RESULTS = {
    "CHECKED_IN",
    # Neither an entry nor a failure: a two-parent booking scanned without an
    # attendedCount. Nothing is mutated; the gate operator answers and retries.
    "PARTY_SELECTION_REQUIRED",
    "ALREADY_CHECKED_IN",
    "CANCELLED",
    "SESSION_MISMATCH",
    "EXPIRED_QR",
    "REVOKED_QR",
    "INVALID_QR",
    "RESERVATION_NOT_FOUND",
    "NOT_AUTHORIZED",
}
EXPECTED_SYNC_CONFLICTS = {
    "DUPLICATE_STUDENT_ASSIGNMENT_KEY",
    "STUDENT_IDENTITY_MISMATCH",
    "CROSS_BRANCH_STUDENT_NO",
}
EXPECTED_SMS_PURPOSES = {
    "OTP",
    "BOOKING_CONFIRMED",
    "BOOKING_UPDATED",
    "BOOKING_CANCELLED",
    "FIRST_CHECK_IN",
    "ADMIN_GROUP",
    "SURVEY",
}
EXPECTED_SMS_DELIVERY_STATUSES = {
    "PENDING",
    "CLAIMED",
    "SENDING",
    "SENT",
    "BLOCKED_DISABLED",
    "BLOCKED_ALLOWLIST",
    "FAILED_PERMANENT",
    "DELIVERY_UNKNOWN",
    "DEAD",
    "CANCELLED",
}
EXPECTED_SMS_ATTEMPT_RESULTS = {
    "SENT",
    "BLOCKED_DISABLED",
    "BLOCKED_ALLOWLIST",
    "RETRYABLE",
    "FAILED_PERMANENT",
    "DELIVERY_UNKNOWN",
    "DEAD",
}
EXPECTED_SHEETS_DELIVERY_STATUSES = {
    "PENDING",
    "CLAIMED",
    "RETRY",
    "SUCCEEDED",
    "DEAD",
    "BLOCKED",
}
EXPECTED_SHEETS_ATTEMPT_RESULTS = {"SUCCEEDED", "RETRY", "DEAD", "BLOCKED"}
CANONICAL_CONSTANTS = {
    "rawFetchedAssignmentCount": 10021,
    "bracketExcludedAssignmentCount": 6222,
    "includedAssignmentCount": 3799,
    "uniqueStudentCount": 3377,
    "multiAssignmentStudentCount": 371,
    "regularRepresentativeCount": 2986,
    "scienceAliasRepresentativeCount": 387,
    "multipleRegularAmbiguousCount": 1,
    "noClassAmbiguousCount": 3,
    "ambiguousStudentCount": 4,
}
BOOKING_SCOPE_AUTHORIZATION = {
    "ALL": "selected-students-may-span-branches",
    "BRANCH": "every-selected-student-must-match-session-branch",
}
PUBLIC_BOOKING_CREATE_SCOPE_AUTHORIZATION = {
    "ALL": "all-auto-linked-students-belong-to-proof-selected-campus",
    "BRANCH": "proof-selected-campus-must-match-session-branch",
}
PUBLIC_BOOKING_UPDATE_SCOPE_AUTHORIZATION = {
    "ALL": "immutable-proof-selected-campus-family",
    "BRANCH": "immutable-family-campus-must-match-session-branch",
}
SCANNER_SCOPE_AUTHORIZATION = {
    "ALL": "any-scanner-device-branch",
    "BRANCH": "scanner-device-branch-must-match-session-branch",
}


class ContractValidationError(Exception):
    """Raised for a contract invariant violation."""


class DuplicateKeyError(ContractValidationError):
    """Raised before YAML construction can silently overwrite a mapping key."""


class UniqueKeyLoader(yaml.SafeLoader):
    """PyYAML SafeLoader that rejects duplicate mapping keys."""


def _construct_unique_mapping(
    loader: UniqueKeyLoader, node: yaml.nodes.MappingNode, deep: bool = False
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    key_marks: dict[Any, yaml.error.Mark] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise DuplicateKeyError(
                f"unhashable YAML mapping key at "
                f"{key_node.start_mark.line + 1}:{key_node.start_mark.column + 1}"
            ) from exc
        if duplicate:
            first = key_marks[key]
            current = key_node.start_mark
            raise DuplicateKeyError(
                f"duplicate YAML key {key!r} at "
                f"{current.line + 1}:{current.column + 1}; first defined at "
                f"{first.line + 1}:{first.column + 1}"
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
        key_marks[key] = key_node.start_mark
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def fail(message: str) -> None:
    raise ContractValidationError(message)


def load_contract(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            document = yaml.load(stream, Loader=UniqueKeyLoader)
    except yaml.YAMLError as exc:
        raise ContractValidationError(f"invalid YAML: {exc}") from exc
    if not isinstance(document, dict):
        fail("OpenAPI document root must be a mapping")
    return document


def walk(value: Any, pointer: str = "#") -> Iterable[tuple[str, Any]]:
    yield pointer, value
    if isinstance(value, Mapping):
        for key, child in value.items():
            escaped = str(key).replace("~", "~0").replace("/", "~1")
            yield from walk(child, f"{pointer}/{escaped}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, f"{pointer}/{index}")


def resolve_ref(document: Mapping[str, Any], reference: str) -> Any:
    if not isinstance(reference, str) or not reference.startswith("#/"):
        fail(f"only internal JSON Pointer references are allowed: {reference!r}")
    current: Any = document
    for raw_token in reference[2:].split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Mapping):
            if token not in current:
                fail(f"unresolved internal reference {reference!r} at token {token!r}")
            current = current[token]
        elif isinstance(current, list):
            try:
                index = int(token)
                current = current[index]
            except (ValueError, IndexError) as exc:
                raise ContractValidationError(
                    f"unresolved internal reference {reference!r} at list token {token!r}"
                ) from exc
        else:
            fail(f"unresolved internal reference {reference!r}; traversed a scalar")
    return current


def dereference(document: Mapping[str, Any], value: Any) -> Any:
    seen: set[str] = set()
    current = value
    while isinstance(current, Mapping) and "$ref" in current:
        reference = current["$ref"]
        if reference in seen:
            fail(f"cyclic direct reference while dereferencing {reference!r}")
        seen.add(reference)
        current = resolve_ref(document, reference)
    return current


def iter_operations(
    document: Mapping[str, Any],
) -> Iterable[tuple[str, str, Mapping[str, Any], Mapping[str, Any]]]:
    paths = document.get("paths")
    if not isinstance(paths, Mapping):
        fail("paths must be a mapping")
    for path, path_item in paths.items():
        if not isinstance(path, str) or not path.startswith("/"):
            fail(f"invalid path key {path!r}")
        if not isinstance(path_item, Mapping):
            fail(f"path item {path!r} must be a mapping")
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            if not isinstance(operation, Mapping):
                fail(f"{method.upper()} {path} must be a mapping")
            yield path, method, operation, path_item


def operation_label(path: str, method: str, operation: Mapping[str, Any]) -> str:
    operation_id = operation.get("operationId", "<missing>")
    return f"{method.upper()} {path} ({operation_id})"


def merged_parameters(
    document: Mapping[str, Any],
    path_item: Mapping[str, Any],
    operation: Mapping[str, Any],
) -> list[Mapping[str, Any]]:
    result: list[Mapping[str, Any]] = []
    for source in (path_item.get("parameters", []), operation.get("parameters", [])):
        if not isinstance(source, list):
            fail("parameters must be an array")
        for value in source:
            resolved = dereference(document, value)
            if not isinstance(resolved, Mapping):
                fail("a parameter reference did not resolve to a mapping")
            result.append(resolved)
    return result


def has_required_header(parameters: Iterable[Mapping[str, Any]], name: str) -> bool:
    expected = name.casefold()
    return any(
        parameter.get("in") == "header"
        and str(parameter.get("name", "")).casefold() == expected
        and parameter.get("required") is True
        for parameter in parameters
    )


def operation_security_names(operation: Mapping[str, Any]) -> set[str]:
    security = operation.get("security")
    if not isinstance(security, list):
        return set()
    names: set[str] = set()
    for requirement in security:
        if isinstance(requirement, Mapping):
            names.update(str(name) for name in requirement)
    return names


def validate_document_shape(document: Mapping[str, Any]) -> None:
    if document.get("openapi") != "3.1.0":
        fail("openapi must be exactly 3.1.0")
    info = document.get("info")
    if not isinstance(info, Mapping) or not info.get("title") or not info.get("version"):
        fail("info.title and info.version are required")
    components = document.get("components")
    if not isinstance(components, Mapping):
        fail("components must be a mapping")
    for required in ("securitySchemes", "parameters", "responses", "schemas"):
        if not isinstance(components.get(required), Mapping):
            fail(f"components.{required} must be a mapping")


def validate_internal_references(document: Mapping[str, Any]) -> None:
    for pointer, value in walk(document):
        if isinstance(value, Mapping) and "$ref" in value:
            reference = value["$ref"]
            try:
                resolve_ref(document, reference)
            except ContractValidationError as exc:
                raise ContractValidationError(f"{pointer}: {exc}") from exc


def validate_operations(document: Mapping[str, Any]) -> tuple[int, int, int]:
    operation_ids: dict[str, str] = {}
    durable_count = 0
    ephemeral_count = 0
    for path, method, operation, path_item in iter_operations(document):
        label = operation_label(path, method, operation)
        operation_id = operation.get("operationId")
        if not isinstance(operation_id, str) or not operation_id.strip():
            fail(f"{label}: operationId is required")
        if operation_id in operation_ids:
            fail(
                f"duplicate operationId {operation_id!r}: "
                f"{operation_ids[operation_id]} and {method.upper()} {path}"
            )
        operation_ids[operation_id] = f"{method.upper()} {path}"

        if "security" not in operation:
            fail(f"{label}: security must be explicit, even when it is []")
        security = operation["security"]
        if not isinstance(security, list):
            fail(f"{label}: security must be an array")

        parameters = merged_parameters(document, path_item, operation)
        seen_parameters: set[tuple[str, str]] = set()
        for parameter in parameters:
            location = parameter.get("in")
            name = parameter.get("name")
            if not isinstance(location, str) or not isinstance(name, str):
                fail(f"{label}: every parameter needs string name and in")
            key = (location, name.casefold() if location == "header" else name)
            if key in seen_parameters:
                fail(f"{label}: duplicate parameter {location}:{name}")
            seen_parameters.add(key)

        placeholders = set(PATH_PARAMETER_RE.findall(path))
        defined_path_parameters = {
            str(parameter.get("name"))
            for parameter in parameters
            if parameter.get("in") == "path"
        }
        if placeholders != defined_path_parameters:
            fail(
                f"{label}: path placeholders {sorted(placeholders)} do not match "
                f"defined path parameters {sorted(defined_path_parameters)}"
            )
        for parameter in parameters:
            if parameter.get("in") == "path" and parameter.get("required") is not True:
                fail(f"{label}: path parameter {parameter.get('name')!r} must be required")

        security_names = operation_security_names(operation)
        is_mutation = method in MUTATING_METHODS
        if is_mutation:
            mutation_kind = operation.get("x-mutation-kind")
            if mutation_kind not in {"durable", "ephemeral"}:
                fail(f"{label}: mutating operation must declare x-mutation-kind")
            if mutation_kind == "durable":
                durable_count += 1
                if operation.get("x-idempotency") != "required":
                    fail(f"{label}: durable mutation must declare x-idempotency: required")
                if not has_required_header(parameters, "Idempotency-Key"):
                    fail(f"{label}: durable mutation requires Idempotency-Key")
            else:
                ephemeral_count += 1
                if operation.get("x-idempotency") != "exempt":
                    fail(f"{label}: ephemeral mutation must declare x-idempotency: exempt")
                if has_required_header(parameters, "Idempotency-Key"):
                    fail(f"{label}: ephemeral mutation must not require Idempotency-Key")
                if not operation.get("x-idempotency-exemption-reason"):
                    fail(f"{label}: ephemeral mutation needs an idempotency exemption reason")
                description = str(operation.get("description", "")).casefold()
                if "ephemeral" not in description:
                    fail(f"{label}: ephemeral mutation description must explain the rationale")

        requires_csrf = operation.get("x-requires-csrf") is True
        if is_mutation and "cookieAuth" in security_names and not requires_csrf:
            fail(f"{label}: mutating cookieAuth operation must set x-requires-csrf")
        if requires_csrf and not has_required_header(parameters, "X-CSRF-Token"):
            fail(f"{label}: X-CSRF-Token is required")
        if operation.get("x-requires-same-origin") is True and not has_required_header(
            parameters, "Origin"
        ):
            fail(f"{label}: same-origin mutation requires Origin")

        if is_mutation and "requestBody" in operation:
            request_body = dereference(document, operation["requestBody"])
            if not isinstance(request_body, Mapping):
                fail(f"{label}: requestBody must resolve to a mapping")
            content = request_body.get("content")
            request_media_type = operation.get("x-request-media-type", "application/json")
            if request_media_type == "multipart/form-data":
                if operation_id != "replaceCurrentPoster":
                    fail(f"{label}: multipart mutation is not in the poster-upload allowlist")
            elif request_media_type != "application/json":
                fail(f"{label}: unsupported state-changing request media type")
            if not isinstance(content, Mapping) or set(content) != {request_media_type}:
                fail(f"{label}: request body must contain exactly {request_media_type}")
            media = content[request_media_type]
            if not isinstance(media, Mapping) or "schema" not in media:
                fail(f"{label}: {request_media_type} request body needs a schema")

        responses = operation.get("responses")
        if not isinstance(responses, Mapping) or not responses:
            fail(f"{label}: responses must be a non-empty mapping")
        for status, response_value in responses.items():
            response = dereference(document, response_value)
            if not isinstance(response, Mapping) or not response.get("description"):
                fail(f"{label}: response {status} needs a description")
            if str(status).startswith("2") and str(status) != "204":
                content = response.get("content")
                binary_media_type = operation.get("x-binary-response-media-type")
                expected_media_type = (
                    binary_media_type
                    if isinstance(binary_media_type, str)
                    else "application/json"
                )
                if not isinstance(content, Mapping) or set(content) != {expected_media_type}:
                    fail(
                        f"{label}: success response {status} needs exactly "
                        f"{expected_media_type}"
                    )
                media = content[expected_media_type]
                if not isinstance(media, Mapping) or "schema" not in media:
                    fail(f"{label}: success response {status} needs a schema")
                response_schema = dereference(document, media["schema"])
                if isinstance(binary_media_type, str) and (
                    not isinstance(response_schema, Mapping)
                    or response_schema.get("type") != "string"
                    or response_schema.get("format") != "binary"
                ):
                    fail(f"{label}: binary success response must use string/binary schema")

        if method == "delete":
            hard_delete = operation.get("x-hard-delete")
            if hard_delete not in {"forbidden", "required", "conditional-unused"}:
                fail(f"{label}: DELETE must explicitly declare its persistence lifecycle")
            if hard_delete == "required" and (
                not isinstance(operation.get("x-delete-dependencies"), Mapping)
                or not operation.get("x-delete-missing")
            ):
                fail(f"{label}: hard DELETE must contract dependency and missing-row semantics")
            if hard_delete == "required" and operation_id not in {
                "deleteScannerDevice",
                "unpairCurrentScanner",
            }:
                fail(f"{label}: hard DELETE is not in the explicit scanner lifecycle allowlist")
            if hard_delete == "conditional-unused" and operation_id != "archiveSmsTemplate":
                fail(f"{label}: conditional hard DELETE is not in the SMS template lifecycle allowlist")
            if hard_delete == "conditional-unused" and (
                not isinstance(operation.get("x-delete-dependencies"), Mapping)
                or not operation.get("x-delete-missing")
            ):
                fail(f"{label}: conditional DELETE must contract history and missing-row semantics")

    missing = CRITICAL_OPERATION_IDS - set(operation_ids)
    if missing:
        fail(f"missing critical operationIds: {', '.join(sorted(missing))}")
    missing_audits = AUDIT_OPERATION_IDS - set(operation_ids)
    if missing_audits:
        fail(f"missing append-only audit operations: {', '.join(sorted(missing_audits))}")
    return len(operation_ids), durable_count, ephemeral_count


def validate_security(document: Mapping[str, Any]) -> None:
    schemes = document["components"]["securitySchemes"]
    expected = {
        "cookieAuth": ("apiKey", "cookie", "npr_seminar_session"),
        "bookingProof": ("apiKey", "header", "X-Booking-Proof"),
        "qrCredential": ("apiKey", "header", "X-QR-Token"),
    }
    for name, (scheme_type, location, wire_name) in expected.items():
        scheme = schemes.get(name)
        if not isinstance(scheme, Mapping):
            fail(f"missing security scheme {name}")
        if (
            scheme.get("type"),
            scheme.get("in"),
            scheme.get("name"),
        ) != (scheme_type, location, wire_name):
            fail(f"security scheme {name} has the wrong wire contract")
    for forbidden in ("bearerAuth", "jwtAuth"):
        if forbidden in schemes:
            fail(f"forbidden legacy security scheme remains: {forbidden}")
    for path, method, operation, _ in iter_operations(document):
        label = operation_label(path, method, operation)
        for requirement in operation.get("security", []):
            if not isinstance(requirement, Mapping):
                fail(f"{label}: security requirement must be a mapping")
            for scheme_name in requirement:
                if scheme_name not in schemes:
                    fail(f"{label}: unknown security scheme {scheme_name!r}")


def schema(document: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    value = document["components"]["schemas"].get(name)
    if not isinstance(value, Mapping):
        fail(f"missing schema {name}")
    return value


def schema_properties(document: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    value = dereference(document, schema(document, name))
    properties = value.get("properties") if isinstance(value, Mapping) else None
    if not isinstance(properties, Mapping):
        fail(f"schema {name} must define properties")
    return properties


def operation_by_id(
    document: Mapping[str, Any], operation_id: str
) -> tuple[str, str, Mapping[str, Any], Mapping[str, Any]]:
    matches = [
        item
        for item in iter_operations(document)
        if item[2].get("operationId") == operation_id
    ]
    if len(matches) != 1:
        fail(f"expected exactly one operationId {operation_id}, got {len(matches)}")
    return matches[0]


def validate_nullable_branch_property(
    value: Any, *, label: str
) -> None:
    if not isinstance(value, Mapping):
        fail(f"{label} must be a schema mapping")
    alternatives = value.get("oneOf")
    if not isinstance(alternatives, list) or len(alternatives) != 2:
        fail(f"{label} must be exactly Branch or null")
    has_branch = any(
        isinstance(item, Mapping)
        and item.get("$ref") == "#/components/schemas/Branch"
        for item in alternatives
    )
    has_null = any(
        isinstance(item, Mapping) and item.get("type") == "null"
        for item in alternatives
    )
    if not has_branch or not has_null:
        fail(f"{label} must be exactly Branch or null")


def validate_scope_conditionals(
    value: Mapping[str, Any], *, scope_field: str, branch_field: str, label: str
) -> None:
    rules = value.get("allOf")
    if not isinstance(rules, list):
        fail(f"{label} must couple {scope_field} and {branch_field} with allOf")
    outcomes: dict[str, Any] = {}
    for rule in rules:
        if not isinstance(rule, Mapping):
            continue
        condition = rule.get("if")
        consequence = rule.get("then")
        if not isinstance(condition, Mapping) or not isinstance(consequence, Mapping):
            continue
        condition_properties = condition.get("properties", {})
        if not isinstance(condition_properties, Mapping):
            continue
        scope_condition = condition_properties.get(scope_field, {})
        if not isinstance(scope_condition, Mapping):
            continue
        scope = scope_condition.get("const")
        consequence_properties = consequence.get("properties", {})
        if scope in {"ALL", "BRANCH"} and isinstance(
            consequence_properties, Mapping
        ):
            outcomes[str(scope)] = consequence_properties.get(branch_field)
    all_branch = outcomes.get("ALL")
    branch_branch = outcomes.get("BRANCH")
    if not isinstance(all_branch, Mapping) or all_branch.get("type") != "null":
        fail(f"{label}: ALL must require {branch_field}=null")
    if (
        not isinstance(branch_branch, Mapping)
        or branch_branch.get("$ref") != "#/components/schemas/Branch"
    ):
        fail(f"{label}: BRANCH must require a concrete Branch")


def validate_domain_invariants(document: Mapping[str, Any]) -> None:
    paths = document["paths"]
    legacy_path = "/api/v1/admin/bookings/{bookingId}"
    if legacy_path in paths:
        fail(f"forbidden child-booking path remains: {legacy_path}")
    for path in paths:
        lowered = str(path).casefold()
        if any(token in lowered for token in ("fixture", "bypass", "test-only")):
            fail(f"test fixture or bypass path is forbidden: {path}")

    problem_required = set(schema(document, "Problem").get("required", []))
    if not PROBLEM_REQUIRED.issubset(problem_required):
        missing = PROBLEM_REQUIRED - problem_required
        fail(f"Problem schema is missing required RFC 9457 fields: {sorted(missing)}")
    redactions = set(document.get("info", {}).get("x-sensitive-log-redaction", []))
    if not {
        "X-Booking-Proof",
        "bookingProof",
        "contact",
        "motherPhone",
        "fatherPhone",
    }.issubset(redactions):
        fail("booking proofs and full parent-contact response fields must be log-redacted")

    audit_sequence = schema(document, "AuditSequence")
    if audit_sequence.get("type") != "string" or audit_sequence.get("pattern") != (
        r"^[1-9][0-9]*$"
    ):
        fail("audit sequences must be precision-safe decimal strings")
    for event_schema_name in (
        "BookingAuditEvent",
        "CheckInAuditEvent",
        "StudentAuditEvent",
        "SyncAuditEvent",
        "CircuitAuditEvent",
        "DeviceAuditEvent",
    ):
        if schema_properties(document, event_schema_name).get("sequence") != {
            "$ref": "#/components/schemas/AuditSequence"
        }:
            fail(f"{event_schema_name}.sequence must reference AuditSequence")
    scanner_snapshot_fields = {
        "scannerDeviceName",
        "scannerEntranceName",
        "scannerGateCode",
    }
    for event_schema_name in ("BookingAuditEvent", "CheckInAuditEvent"):
        event_schema = schema(document, event_schema_name)
        if not scanner_snapshot_fields.issubset(set(event_schema.get("required", []))):
            fail(f"{event_schema_name} must require nullable immutable scanner snapshots")
        for field in scanner_snapshot_fields:
            field_type = schema_properties(document, event_schema_name).get(field, {}).get("type")
            if not isinstance(field_type, list) or set(field_type) != {"string", "null"}:
                fail(f"{event_schema_name}.{field} must be a nullable string")
    event_page_sequence = schema_properties(document, "EventPageMeta").get(
        "nextAfterSequence", {}
    )
    if (
        not isinstance(event_page_sequence, Mapping)
        or set(event_page_sequence.get("type", [])) != {"string", "null"}
        or event_page_sequence.get("pattern") != r"^[0-9]+$"
    ):
        fail("event cursors must be nullable precision-safe decimal strings")
    page_size_parameter = dereference(
        document, document["components"]["parameters"].get("PageSize")
    )
    page_size_schema = (
        page_size_parameter.get("schema", {})
        if isinstance(page_size_parameter, Mapping)
        else {}
    )
    if page_size_schema.get("maximum") != 200 or page_size_schema.get("default") != 50:
        fail("PageSize must match the controller-wide 1..200, default 50 contract")

    sessions_path, sessions_method, sessions_operation, _ = operation_by_id(
        document, "listAdminSeminarSessions"
    )
    if (sessions_path, sessions_method) != (
        "/api/v1/admin/seminars/{seminarId}/sessions",
        "get",
    ):
        fail("admin seminar session list has the wrong route")
    if operation_security_names(sessions_operation) != {"cookieAuth"} or sessions_operation.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("admin seminar session list must require ADMIN cookie authentication")
    if (
        sessions_operation.get("x-operations-summary-query-shape")
        != "BATCHED_BY_SESSION_AND_STATUS"
        or sessions_operation.get("x-operations-summary-count-unit")
        != "FAMILY_BOOKING"
        or sessions_operation.get("x-family-booking-status-semantics")
        != {
            "active": ["RESERVED", "CHECKED_IN"],
            "checkedIn": ["CHECKED_IN"],
            "unchecked": ["RESERVED"],
            "cancelled": ["CANCELLED"],
            "noShow": ["NO_SHOW"],
        }
    ):
        fail("admin seminar session list must batch family-booking operations summaries")
    if (
        sessions_operation.get("responses", {})
        .get("200", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
        != {"$ref": "#/components/schemas/AdminSeminarSessionPage"}
    ):
        fail("admin seminar session list must return AdminSeminarSessionPage")
    admin_session = schema(document, "AdminSeminarSession")
    admin_session_properties = schema_properties(document, "AdminSeminarSession")
    if admin_session_properties.get("operationsSummary") != {
        "$ref": "#/components/schemas/SessionOperationsSummary"
    } or "operationsSummary" in set(admin_session.get("required", [])):
        fail("AdminSeminarSession must declare an optional operationsSummary for list specialization")
    session_list_item = schema(document, "AdminSeminarSessionListItem")
    if session_list_item.get("allOf") != [
        {"$ref": "#/components/schemas/AdminSeminarSession"},
        {"type": "object", "required": ["operationsSummary"]},
    ]:
        fail("AdminSeminarSessionListItem must require the base operationsSummary")
    if (
        schema_properties(document, "AdminSeminarSessionPage")
        .get("items", {})
        .get("items")
        != {"$ref": "#/components/schemas/AdminSeminarSessionListItem"}
    ):
        fail("AdminSeminarSessionPage items must require operationsSummary")

    roster_path, roster_method, roster_operation, roster_path_item = operation_by_id(
        document, "getAdminSessionRoster"
    )
    if (roster_path, roster_method) != (
        "/api/v1/admin/seminar-sessions/{sessionId}/roster",
        "get",
    ):
        fail("admin session roster has the wrong route")
    if operation_security_names(roster_operation) != {"cookieAuth"} or roster_operation.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("admin session roster must require ADMIN cookie authentication")
    if roster_operation.get("x-monitoring-statuses") != ["RESERVED", "CHECKED_IN"]:
        fail("admin session roster monitoring must include only active bookings")
    roster_parameters = merged_parameters(document, roster_path_item, roster_operation)
    roster_parameter_names = {
        (parameter.get("in"), parameter.get("name"))
        for parameter in roster_parameters
    }
    expected_roster_filters = {
        ("path", "sessionId"),
        ("query", "branch"),
        ("query", "unitGroup"),
        ("query", "teacherName"),
        ("query", "query"),
    }
    if roster_parameter_names != expected_roster_filters | {
        ("query", "page"),
        ("query", "pageSize"),
    }:
        fail("JSON roster filters must match branch, unit, teacher, query/contact, and pagination")

    export_path, export_method, export_operation, export_path_item = operation_by_id(
        document, "exportAdminSessionRosterXlsx"
    )
    if (export_path, export_method) != (
        "/api/v1/admin/seminar-sessions/{sessionId}/roster.xlsx",
        "get",
    ):
        fail("admin session roster XLSX export has the wrong route")
    if operation_security_names(export_operation) != {"cookieAuth"} or export_operation.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("admin session roster XLSX export must require ADMIN cookie authentication")
    export_parameter_names = {
        (parameter.get("in"), parameter.get("name"))
        for parameter in merged_parameters(document, export_path_item, export_operation)
    }
    if export_parameter_names != expected_roster_filters:
        fail("XLSX export must share every roster filter and expose no pagination")
    xlsx_media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    if (
        export_operation.get("x-pagination") != "none"
        or export_operation.get("x-binary-response-media-type") != xlsx_media_type
        or export_operation.get("x-formula-injection-neutralization")
        != "leading-formula-trigger-apostrophe"
    ):
        fail("XLSX export must be unpaginated, binary, and formula-injection safe")
    export_response = export_operation.get("responses", {}).get("200", {})
    if "Content-Disposition" not in export_response.get("headers", {}):
        fail("XLSX export must contract an attachment Content-Disposition")

    operations_path, operations_method, operations_summary, operations_path_item = (
        operation_by_id(document, "getAdminSessionOperationsSummary")
    )
    if (operations_path, operations_method) != (
        "/api/v1/admin/seminar-sessions/{sessionId}/operations-summary",
        "get",
    ):
        fail("session operations summary has the wrong route")
    if operation_security_names(operations_summary) != {"cookieAuth"} or operations_summary.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("session operations summary must require ADMIN cookie authentication")
    if {
        (parameter.get("in"), parameter.get("name"))
        for parameter in merged_parameters(document, operations_path_item, operations_summary)
    } != {("path", "sessionId")}:
        fail("session operations summary must be session-scoped without hidden filters")
    operations_semantics = {
        "active": ["RESERVED", "CHECKED_IN"],
        "checkedIn": ["CHECKED_IN"],
        "unchecked": ["RESERVED"],
        "cancelled": ["CANCELLED"],
        "noShow": ["NO_SHOW"],
    }
    if operations_summary.get("x-family-booking-status-semantics") != operations_semantics:
        fail("session operations summary status semantics have drifted")
    if (
        operations_summary.get("responses", {})
        .get("200", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
        != {"$ref": "#/components/schemas/SessionOperationsSummary"}
    ):
        fail("session operations summary must return SessionOperationsSummary")
    expected_operations_fields = {
        "activeBookingCount",
        "checkedInBookingCount",
        "uncheckedBookingCount",
        "cancelledBookingCount",
        "noShowBookingCount",
        "attendeeCount",
    }
    operations_schema = schema(document, "SessionOperationsSummary")
    if (
        set(operations_schema.get("required", [])) != expected_operations_fields
        or set(schema_properties(document, "SessionOperationsSummary"))
        != expected_operations_fields
    ):
        fail("SessionOperationsSummary must expose all five POC family states and attendeeCount")

    attendance_monitoring_fields = {
        "studentCount",
        "familyBookingCount",
        "attendeeCount",
    }
    attendance_monitoring = schema(document, "AttendanceMonitoring")
    if (
        set(attendance_monitoring.get("required", [])) != attendance_monitoring_fields
        or set(schema_properties(document, "AttendanceMonitoring"))
        != attendance_monitoring_fields
    ):
        fail("AttendanceMonitoring must expose student, family, and attendee counts")

    statistics_path, statistics_method, statistics_operation, statistics_path_item = (
        operation_by_id(document, "getAdminSessionStatistics")
    )
    if (statistics_path, statistics_method) != (
        "/api/v1/admin/seminar-sessions/{sessionId}/statistics",
        "get",
    ):
        fail("session statistics has the wrong route")
    if operation_security_names(statistics_operation) != {"cookieAuth"} or statistics_operation.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("session statistics must require ADMIN cookie authentication")
    if {
        (parameter.get("in"), parameter.get("name"))
        for parameter in merged_parameters(document, statistics_path_item, statistics_operation)
    } != {("path", "sessionId"), ("query", "branch")}:
        fail("session statistics must expose only the optional branch filter")
    statistics_semantics = {
        "active": ["RESERVED", "CHECKED_IN"],
        "reserved": ["RESERVED"],
        "checkedIn": ["CHECKED_IN"],
        "cancelled": ["CANCELLED"],
        "noShow": ["NO_SHOW"],
    }
    if (
        statistics_operation.get("x-family-booking-status-semantics")
        != statistics_semantics
        or statistics_operation.get("x-overall-count-source") != "summary"
        or statistics_operation.get("x-unit-booking-population")
        != {
            "ALL": "ALL_SCOPED_FAMILY_BOOKINGS",
            "CONCRETE": "ELIGIBLE_ENROLLED_FAMILY_BOOKINGS",
        }
        or statistics_operation.get("x-guest-booking-policy")
        != "INCLUDED_IN_SUMMARY_CHANNELS_AND_ALL_UNIT"
        or statistics_operation.get("x-all-unit-summary-equality")
        != [
            "activeBookingCount",
            "reservedBookingCount",
            "checkedInBookingCount",
        ]
        or statistics_operation.get("x-channel-source-map")
        != {
            "MOBILE": ["WEB_APP"],
            "MANUAL": ["PHONE", "TEACHER", "ON_SITE"],
        }
        or statistics_operation.get("x-monitoring-statuses")
        != ["RESERVED", "CHECKED_IN"]
    ):
        fail("session statistics family, unit, guest, or channel semantics have drifted")
    if (
        statistics_operation.get("responses", {})
        .get("200", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
        != {"$ref": "#/components/schemas/SessionStatistics"}
    ):
        fail("session statistics must return SessionStatistics")
    if set(schema(document, "StatisticsUnitGroup").get("enum", [])) != {
        "ALL",
        "ELEMENTARY",
        "MIDDLE_1",
        "MIDDLE_2",
        "MIDDLE_3",
        "SPECIAL_PURPOSE",
        "HIGH",
        "SCIENCE",
    }:
        fail("statistics unit rows must exclude GUEST and retain all enrolled unit groups")
    statistics_schema = schema(document, "SessionStatistics")
    if set(statistics_schema.get("required", [])) != {
        "branch",
        "summary",
        "units",
        "channels",
        "survey",
    }:
        fail("SessionStatistics is missing a runtime response field")
    statistics_properties = schema_properties(document, "SessionStatistics")
    if (
        statistics_properties.get("units", {}).get("minItems") != 8
        or statistics_properties.get("units", {}).get("maxItems") != 8
        or statistics_properties.get("channels", {}).get("minItems") != 2
        or statistics_properties.get("channels", {}).get("maxItems") != 2
    ):
        fail("SessionStatistics must return eight unit rows and two channel rows")
    expected_statistics_fields = {
        "activeBookingCount",
        "reservedBookingCount",
        "checkedInBookingCount",
        "cancelledBookingCount",
        "noShowBookingCount",
        "monitoring",
    }
    expected_unit_fields = {
        "unitGroup",
        "activeBookingCount",
        "reservedBookingCount",
        "checkedInBookingCount",
        "monitoring",
    }
    expected_channel_fields = {
        "channel",
        "bookingSources",
        "activeBookingCount",
        "reservedBookingCount",
        "checkedInBookingCount",
        "cancelledBookingCount",
        "noShowBookingCount",
        "monitoring",
    }
    for schema_name, expected_fields in (
        ("SessionStatisticsSummary", expected_statistics_fields),
        ("SessionStatisticsUnit", expected_unit_fields),
        ("SessionStatisticsChannel", expected_channel_fields),
        ("SessionStatisticsSurvey", {"averageRating", "responseCount", "scope"}),
    ):
        response_schema = schema(document, schema_name)
        if (
            set(response_schema.get("required", [])) != expected_fields
            or set(schema_properties(document, schema_name)) != expected_fields
        ):
            fail(f"{schema_name} does not match the runtime response")
    if schema(document, "SessionStatisticsUnit").get("x-booking-population") != {
        "ALL": "ALL_SCOPED_FAMILY_BOOKINGS",
        "CONCRETE": "ELIGIBLE_ENROLLED_FAMILY_BOOKINGS",
    }:
        fail("SessionStatisticsUnit must distinguish ALL-family and concrete enrolled populations")

    roster_row = schema(document, "SessionRosterRow")
    roster_row_properties = schema_properties(document, "SessionRosterRow")
    roster_row_fields = set(roster_row_properties)
    if not {"mathClassName", "scienceClassNames"}.issubset(
        set(roster_row.get("required", []))
    ) or not {"mathClassName", "scienceClassNames"}.issubset(roster_row_fields):
        fail("SessionRosterRow must require mathClassName and scienceClassNames")
    if set(roster_row_properties.get("mathClassName", {}).get("type", [])) != {
        "string",
        "null",
    } or (
        roster_row_properties.get("scienceClassNames", {}).get("type") != "array"
        or roster_row_properties.get("scienceClassNames", {}).get("uniqueItems") is not True
        or roster_row_properties.get("scienceClassNames", {}).get("items", {}).get("type")
        != "string"
    ):
        fail("roster math class must be nullable and science classes a unique string array")
    roster_teacher = roster_row_properties.get("primaryTeacher", {})
    if (
        set(roster_teacher.get("type", [])) != {"string", "null"}
        or roster_teacher.get("x-homeroom-applicability")
        != "MATH_REGULAR_CLASS_ONLY"
        or roster_teacher.get("x-science-only-policy") != "RETURN_NULL"
        or roster_teacher.get("x-assignment-teacher-fallback") != "forbidden"
    ):
        fail("SessionRosterRow.primaryTeacher must be nullable and math-projection-only")
    roster_teacher_facets = schema_properties(document, "SessionRosterFacets").get(
        "teachers", {}
    )
    if (
        roster_teacher_facets.get("x-homeroom-applicability")
        != "MATH_REGULAR_CLASS_ONLY"
        or roster_teacher_facets.get("x-science-only-policy") != "EXCLUDED"
    ):
        fail("SessionRosterFacets.teachers must exclude science-only and no-math rows")
    roster_page = schema(document, "SessionRosterPage")
    if (
        set(roster_page.get("required", [])) != {"items", "page", "facets", "monitoring"}
        or schema_properties(document, "SessionRosterPage").get("monitoring")
        != {"$ref": "#/components/schemas/AttendanceMonitoring"}
    ):
        fail("SessionRosterPage must require AttendanceMonitoring")

    if set(schema(document, "SeminarSessionScope").get("enum", [])) != {
        "ALL",
        "BRANCH",
    }:
        fail("SeminarSessionScope must contain exactly ALL and BRANCH")
    for session_schema_name in (
        "PublicSeminarSession",
        "AdminSeminarSession",
        "SeminarSessionCreateRequest",
    ):
        session_schema = schema(document, session_schema_name)
        required = set(session_schema.get("required", []))
        if not {"scope", "branch"}.issubset(required):
            fail(f"{session_schema_name} must require scope and branch")
        properties = schema_properties(document, session_schema_name)
        if properties.get("scope", {}).get("$ref") != (
            "#/components/schemas/SeminarSessionScope"
        ):
            fail(f"{session_schema_name}.scope must reference SeminarSessionScope")
        validate_nullable_branch_property(
            properties.get("branch"), label=f"{session_schema_name}.branch"
        )
        validate_scope_conditionals(
            session_schema,
            scope_field="scope",
            branch_field="branch",
            label=session_schema_name,
        )

    session_update = schema(document, "SeminarSessionUpdateRequest")
    session_update_properties = schema_properties(
        document, "SeminarSessionUpdateRequest"
    )
    validate_nullable_branch_property(
        session_update_properties.get("branch"),
        label="SeminarSessionUpdateRequest.branch",
    )
    dependent = session_update.get("dependentRequired", {})
    if dependent.get("scope") != ["branch"] or dependent.get("branch") != ["scope"]:
        fail("SeminarSessionUpdateRequest must require scope and branch together")
    validate_scope_conditionals(
        session_update,
        scope_field="scope",
        branch_field="branch",
        label="SeminarSessionUpdateRequest",
    )

    seed = document.get("info", {}).get("x-current-seed-seminar-session", {})
    if seed.get("scope") != "ALL" or seed.get("branch") is not None:
        fail("current seed seminar session must be ALL and branch=null")

    for operation_id, expected_scope in (
        ("createPublicFamilyBooking", PUBLIC_BOOKING_CREATE_SCOPE_AUTHORIZATION),
        ("updatePublicFamilyBooking", PUBLIC_BOOKING_UPDATE_SCOPE_AUTHORIZATION),
        ("createAdminFamilyBooking", BOOKING_SCOPE_AUTHORIZATION),
        ("updateAdminFamilyBooking", BOOKING_SCOPE_AUTHORIZATION),
    ):
        operation = operation_by_id(document, operation_id)[2]
        if operation.get("x-session-scope-authorization") != expected_scope:
            fail(f"{operation_id} has the wrong booking session-scope rule")
    for operation_id in (
        "listScannerCheckInSessions",
        "createScannerShiftLock",
    ):
        operation = operation_by_id(document, operation_id)[2]
        if operation.get("x-session-scope-authorization") != (
            SCANNER_SCOPE_AUTHORIZATION
        ):
            fail(f"{operation_id} has the wrong scanner session-scope rule")

    shift_lock = schema(document, "ScannerShiftLock")
    shift_required = set(shift_lock.get("required", []))
    if not {"sessionScope", "sessionBranch"}.issubset(shift_required):
        fail("ScannerShiftLock must expose sessionScope and sessionBranch")
    shift_properties = schema_properties(document, "ScannerShiftLock")
    validate_nullable_branch_property(
        shift_properties.get("sessionBranch"), label="ScannerShiftLock.sessionBranch"
    )
    validate_scope_conditionals(
        shift_lock,
        scope_field="sessionScope",
        branch_field="sessionBranch",
        label="ScannerShiftLock",
    )

    pairing_code_id = schema(document, "PairingCodeId")
    if pairing_code_id.get("type") != "string" or pairing_code_id.get("format") != "uuid":
        fail("PairingCodeId must be an opaque UUID schema")

    cancel_path = "/api/v1/admin/scanner-devices/pairing-codes/{pairingCodeId}"
    if cancel_path not in paths or "delete" not in paths[cancel_path]:
        fail("missing exact admin pairing-code cancellation path")
    cancel = paths[cancel_path]["delete"]
    if cancel.get("operationId") != "cancelScannerPairingCode":
        fail("pairing-code cancellation operationId is wrong")
    if operation_security_names(cancel) != {"cookieAuth"}:
        fail("pairing-code cancellation must use ADMIN cookie authentication")
    if cancel.get("x-required-roles") != ["ADMIN"]:
        fail("pairing-code cancellation must require ADMIN")
    if cancel.get("x-race-arbitration") != "atomic-exactly-one-of-claim-or-cancel":
        fail("pairing-code claim/cancel race must be atomic with exactly one winner")
    if cancel.get("x-audit-redaction") != "raw-pairing-code-forbidden":
        fail("pairing-code cancellation audit must forbid the raw code")
    cancel_parameters = merged_parameters(document, paths[cancel_path], cancel)
    path_parameters = [
        parameter for parameter in cancel_parameters if parameter.get("in") == "path"
    ]
    if len(path_parameters) != 1 or path_parameters[0].get("name") != "pairingCodeId":
        fail("pairing-code cancellation path must contain only pairingCodeId")
    path_parameter_schema = dereference(document, path_parameters[0].get("schema"))
    if (
        not isinstance(path_parameter_schema, Mapping)
        or path_parameter_schema.get("format") != "uuid"
    ):
        fail("pairingCodeId path parameter must be a UUID")
    required_cancel_responses = {"204", "401", "403", "404", "409", "503"}
    if not required_cancel_responses.issubset(set(cancel.get("responses", {}))):
        fail("pairing-code cancellation is missing required responses")
    conflict_response = dereference(document, cancel["responses"]["409"])
    conflict_examples = (
        conflict_response.get("content", {})
        .get("application/problem+json", {})
        .get("examples", {})
    )
    conflict_value = conflict_examples.get("alreadyClaimed", {}).get("value", {})
    if conflict_value.get("code") != "PAIRING_CODE_ALREADY_CLAIMED":
        fail("claimed pairing-code cancellation must contract PAIRING_CODE_ALREADY_CLAIMED")

    scanner_list_path, scanner_list_method, scanner_list, scanner_list_item = (
        operation_by_id(document, "listScannerDevices")
    )
    if (scanner_list_path, scanner_list_method) != (
        "/api/v1/admin/scanner-devices",
        "get",
    ):
        fail("scanner device list has the wrong route")
    scanner_list_parameters = merged_parameters(
        document, scanner_list_item, scanner_list
    )
    if {
        (parameter.get("in"), parameter.get("name"))
        for parameter in scanner_list_parameters
    } != {
        ("query", "branch"),
        ("query", "status"),
        ("query", "page"),
        ("query", "pageSize"),
    }:
        fail("scanner list must expose exactly branch, status, page, and pageSize filters")
    scanner_status_parameter = next(
        parameter
        for parameter in scanner_list_parameters
        if parameter.get("name") == "status"
    )
    if scanner_status_parameter.get("schema", {}).get("default") != "ACTIVE":
        fail("scanner list status must default to ACTIVE")
    if scanner_list.get("x-online-presence-ttl-seconds") != 60:
        fail("scanner online presence must use the exact 60-second TTL")

    delete_dependencies = {
        "scannerPairingAudits": "cascade-delete",
        "checkInEvents": "preserve-with-scanner-device-id-set-null",
        "selectedShift": "removed-with-device",
        "redisPresenceAndSessions": "delete-after-commit-and-on-replay",
        "redisClaimedPairingState": "delete-after-commit-and-on-replay",
    }
    delete_path, delete_method, delete_device, _ = operation_by_id(
        document, "deleteScannerDevice"
    )
    if (delete_path, delete_method) != (
        "/api/v1/admin/scanner-devices/{deviceId}",
        "delete",
    ):
        fail("admin scanner hard delete has the wrong route")
    if operation_security_names(delete_device) != {"cookieAuth"} or delete_device.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("admin scanner hard delete must require ADMIN cookie authentication")
    if (
        delete_device.get("x-hard-delete") != "required"
        or delete_device.get("x-delete-missing") != "idempotent-success"
        or delete_device.get("x-delete-dependencies") != delete_dependencies
    ):
        fail("admin scanner hard delete must contract cascade, SET NULL, shift, Redis, and repeat semantics")
    if not {"204", "401", "403", "409", "503"}.issubset(
        set(delete_device.get("responses", {}))
    ) or "404" in delete_device.get("responses", {}):
        fail("admin scanner hard delete must return 204 for an already absent device")

    unpair_path = "/api/v1/scanner/device/pairing"
    if unpair_path not in paths or "delete" not in paths[unpair_path]:
        fail("missing exact scanner self-unpair path")
    unpair = paths[unpair_path]["delete"]
    if unpair.get("operationId") != "unpairCurrentScanner":
        fail("scanner self-unpair operationId is wrong")
    if operation_security_names(unpair) != {"cookieAuth"}:
        fail("scanner self-unpair must use SCANNER cookie authentication")
    if unpair.get("x-required-roles") != ["SCANNER"]:
        fail("scanner self-unpair must require SCANNER")
    if not {"204", "401", "403", "409", "503"}.issubset(
        set(unpair.get("responses", {}))
    ):
        fail("scanner self-unpair is missing required success and failure responses")
    if (
        unpair.get("x-hard-delete") != "required"
        or unpair.get("x-delete-missing") != "idempotent-success-while-authenticated"
        or unpair.get("x-delete-dependencies") != delete_dependencies
    ):
        fail("scanner self-unpair must use the same hard-delete dependency lifecycle")
    unpair_text = " ".join(
        " ".join(str(unpair.get(key, "")).split())
        for key in ("summary", "description")
    ).casefold()
    for required_phrase in (
        "hard-delete",
        "server session",
        "presence",
        "shift",
        "attendance",
        "set to null",
        "audit",
        "newly issued pairing code",
        "401",
    ):
        if required_phrase not in unpair_text:
            fail(f"scanner self-unpair must state {required_phrase!r} semantics")

    revoke = operation_by_id(document, "revokeScannerDevice")[2]
    revoke_text = " ".join(
        " ".join(str(revoke.get(key, "")).split())
        for key in ("summary", "description")
    ).casefold()
    for required_phrase in (
        "session",
        "presence",
        "shift lock",
        "preserved",
        "attendance",
        "audit",
        "new pairing code",
    ):
        if required_phrase not in revoke_text:
            fail(f"scanner revocation must state {required_phrase!r} semantics")

    device_event_types = set(schema(document, "DeviceAuditEventType").get("enum", []))
    if "UNPAIRED_BY_DEVICE" not in device_event_types:
        fail("DeviceAuditEventType must include UNPAIRED_BY_DEVICE")
    if set(schema(document, "ScannerDeviceStatus").get("enum", [])) != {
        "ACTIVE",
        "REVOKED",
        "UNPAIRED",
    }:
        fail("ScannerDeviceStatus must preserve ACTIVE, REVOKED, and UNPAIRED")

    scanner_device = schema(document, "ScannerDevice")
    battery_fields = {
        "lastBatteryLevelPercent",
        "isCharging",
        "batteryReportedAt",
    }
    if not battery_fields.issubset(set(scanner_device.get("required", []))):
        fail("ScannerDevice must require nullable latest battery telemetry fields")
    scanner_device_properties = schema_properties(document, "ScannerDevice")
    level = scanner_device_properties.get("lastBatteryLevelPercent", {})
    if (
        set(level.get("type", [])) != {"integer", "null"}
        or level.get("minimum") != 0
        or level.get("maximum") != 100
    ):
        fail("ScannerDevice.lastBatteryLevelPercent must be nullable integer 0..100")
    charging = scanner_device_properties.get("isCharging", {})
    if set(charging.get("type", [])) != {"boolean", "null"}:
        fail("ScannerDevice.isCharging must be nullable boolean")
    reported_at = scanner_device_properties.get("batteryReportedAt", {})
    if set(reported_at.get("type", [])) != {"string", "null"} or reported_at.get(
        "format"
    ) != "date-time":
        fail("ScannerDevice.batteryReportedAt must be nullable date-time")

    heartbeat = schema(document, "ScannerHeartbeatRequest")
    if {"batteryLevelPercent", "isCharging"} & set(heartbeat.get("required", [])):
        fail("scanner heartbeat battery telemetry must remain optional")
    heartbeat_properties = schema_properties(document, "ScannerHeartbeatRequest")
    heartbeat_level = heartbeat_properties.get("batteryLevelPercent", {})
    if (
        set(heartbeat_level.get("type", [])) != {"integer", "null"}
        or heartbeat_level.get("minimum") != 0
        or heartbeat_level.get("maximum") != 100
    ):
        fail("heartbeat batteryLevelPercent must be optional nullable integer 0..100")
    if set(heartbeat_properties.get("isCharging", {}).get("type", [])) != {
        "boolean",
        "null",
    }:
        fail("heartbeat isCharging must be optional nullable boolean")

    for schema_name in ("FreshPairingCode", "PairingClaimRequest"):
        pairing_code = schema_properties(document, schema_name).get("pairingCode", {})
        if (
            pairing_code.get("minLength") != 6
            or pairing_code.get("maxLength") != 6
            or pairing_code.get("pattern") != PAIRING_CODE_PATTERN
        ):
            fail(f"{schema_name}.pairingCode must use the exact six-character alphabet")
    pairing_claim = schema(document, "PairingClaimRequest")
    if (
        pairing_claim.get("x-pairing-code-normalization")
        != "trim-then-uppercase-before-validation"
    ):
        fail("PairingClaimRequest must normalize trim then uppercase before validation")
    claim_operation = operation_by_id(document, "claimScannerPairingCode")[2]
    if (
        claim_operation.get("x-pairing-code-normalization")
        != "trim-then-uppercase-before-validation"
    ):
        fail("pairing claim operation must normalize trim then uppercase before validation")

    for request_name in (
        "PublicFamilyBookingCreateRequest",
        "PublicFamilyBookingUpdateRequest",
        "AdminFamilyBookingCreateRequest",
        "AdminFamilyBookingUpdateRequest",
    ):
        if "seatCount" in schema_properties(document, request_name):
            fail(f"{request_name} must not accept client seatCount")

    child_properties = set(
        schema_properties(document, "FamilyBookingStudentSnapshot")
    )
    forbidden_child_fields = {
        "seatCount",
        "status",
        "qrToken",
        "qrStatus",
        "qrVersion",
        "checkedInAt",
    }
    present = child_properties & forbidden_child_fields
    if present:
        fail(f"family child snapshot has forbidden aggregate fields: {sorted(present)}")

    public_create = schema_properties(document, "PublicFamilyBookingCreateRequest")
    if {"motherContact", "contact", "bookingSource"} & set(public_create):
        fail("public booking creation must derive contact and WEB_APP source server-side")
    if set(schema(document, "BookingParticipantType").get("enum", [])) != {
        "ENROLLED",
        "GUEST",
    }:
        fail("BookingParticipantType must contain ENROLLED and GUEST")
    public_create_schema = schema(document, "PublicFamilyBookingCreateRequest")
    if not {"participantType", "seminarSessionId", "attendanceParty"}.issubset(
        set(public_create_schema.get("required", []))
    ):
        fail("public booking creation must require its participant discriminator")
    if not {"participantType", "guest"}.issubset(set(public_create)):
        fail("public booking creation must expose its enrolled/guest discriminator")
    if "studentIds" in public_create:
        fail("public booking creation must resolve enrolled students server-side")
    guest_required = set(schema(document, "PublicGuestParticipantInput").get("required", []))
    if guest_required != {"name", "branch", "schoolName", "grade"}:
        fail("public guest input must require name, branch, schoolName, and grade")
    if set(schema(document, "BookingSource").get("enum", [])) != {
        "WEB_APP",
        "PHONE",
        "TEACHER",
        "ON_SITE",
    }:
        fail("BookingSource must contain WEB_APP, PHONE, TEACHER, and ON_SITE")
    if set(schema(document, "AdminBookingSource").get("enum", [])) != {
        "PHONE",
        "TEACHER",
        "ON_SITE",
    }:
        fail("admin booking creation must accept PHONE, TEACHER, and ON_SITE source")
    admin_create = schema(document, "AdminFamilyBookingCreateRequest")
    admin_create_required = set(admin_create.get("required", []))
    if "bookingSource" not in admin_create_required:
        fail("AdminFamilyBookingCreateRequest must require bookingSource")
    if "reason" in admin_create_required:
        fail("AdminFamilyBookingCreateRequest.reason must remain optional")
    admin_create_reason = schema_properties(
        document, "AdminFamilyBookingCreateRequest"
    ).get("reason", {})
    if (
        admin_create_reason.get("type") != "string"
        or admin_create_reason.get("minLength") != 3
        or admin_create_reason.get("maxLength") != 500
        or admin_create_reason.get("x-omitted-value-source") != "bookingSource"
        or admin_create_reason.get("x-derived-values")
        != {
            "PHONE": "ADMIN_CREATE_PHONE",
            "TEACHER": "ADMIN_CREATE_TEACHER",
            "ON_SITE": "ADMIN_CREATE_ON_SITE",
        }
    ):
        fail("optional admin create reason must be bounded and derived from bookingSource when omitted")
    family_booking = schema(document, "FamilyBooking")
    if "bookingSource" not in set(family_booking.get("required", [])):
        fail("FamilyBooking must expose bookingSource")
    family_booking_fields = set(schema_properties(document, "FamilyBooking"))
    if "contact" not in set(family_booking.get("required", [])) or "maskedContact" in family_booking_fields:
        fail("proof-owned and ADMIN FamilyBooking responses must expose full contact, not maskedContact")
    contact = schema_properties(document, "FamilyBooking").get("contact", {})
    if (
        contact.get("type") != "string"
        or contact.get("minLength") != 8
        or contact.get("maxLength") != 15
        or contact.get("pattern") != r"^[0-9]{8,15}$"
    ):
        fail("FamilyBooking.contact must be a normalized full phone number")
    required_child_projection_fields = {
        "familyBookingStudentId",
        "participantType",
        "studentId",
        "unitName",
        "teacherName",
    }
    if not required_child_projection_fields.issubset(
        set(schema(document, "FamilyBookingStudentSnapshot").get("required", []))
    ):
        fail("family child snapshot is missing Sheets projection identity fields")

    # attendedCount is the operator's own answer at the gate, not scanner context, so it
    # is the one field a client may add. Everything else about the scanner (device,
    # session, gate, branch) stays server-derived and must never be client-supplied.
    qr_request_properties = set(schema_properties(document, "QrCheckInRequest"))
    if qr_request_properties != {"qrToken", "attendedCount"}:
        fail("QR check-in request may contain only qrToken and attendedCount; scanner context is server-derived")
    manual_request_properties = set(schema_properties(document, "ManualCheckInRequest"))
    if manual_request_properties != {"familyBookingId", "attendedCount"}:
        fail(
            "manual check-in request may contain only familyBookingId and attendedCount; "
            "scanner context is server-derived"
        )
    manual_candidate_fields = set(schema_properties(document, "ManualCheckInCandidate"))
    if "maskedContact" not in manual_candidate_fields or "contact" in manual_candidate_fields:
        fail("scanner manual-entry candidates must retain maskedContact and exclude contact")
    shift_request_properties = set(schema_properties(document, "ScannerShiftLockRequest"))
    if shift_request_properties != {"seminarSessionId"}:
        fail("shift lock request may contain only seminarSessionId")

    check_in_results = set(schema(document, "CheckInResult").get("enum", []))
    if check_in_results != EXPECTED_CHECK_IN_RESULTS:
        fail("CheckInResult must contain the precise canonical result enum")

    sync_conflicts = set(schema(document, "SyncConflictType").get("enum", []))
    if sync_conflicts != EXPECTED_SYNC_CONFLICTS:
        fail("SyncConflictType must contain only the three canonical conflict types")

    baseline = schema(document, "CanonicalSnapshotBaseline")
    baseline_properties = baseline.get("properties", {})
    for field, expected in CANONICAL_CONSTANTS.items():
        actual = baseline_properties.get(field, {}).get("const")
        if actual != expected:
            fail(f"canonical baseline {field} must be {expected}, got {actual!r}")

    review_path, review_method, review_operation, review_path_item = operation_by_id(
        document, "listAdminStudentsReviewRequired"
    )
    if (review_path, review_method) != (
        "/api/v1/admin/students/review-required",
        "get",
    ):
        fail("review-required student list has the wrong route")
    if operation_security_names(review_operation) != {"cookieAuth"} or review_operation.get(
        "x-required-roles"
    ) != ["ADMIN"]:
        fail("review-required student list must require ADMIN cookie authentication")
    review_parameter_names = {
        (parameter.get("in"), parameter.get("name"))
        for parameter in merged_parameters(document, review_path_item, review_operation)
    }
    if review_parameter_names != {
        ("query", "branch"),
        ("query", "page"),
        ("query", "pageSize"),
    }:
        fail("review-required query contract must match runtime branch and pagination only")
    if review_operation.get("x-authoritative-total-field") != "page.totalItems":
        fail("review-required page.totalItems must be the authoritative filtered total")
    if (
        review_operation.get("responses", {})
        .get("200", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
        != {"$ref": "#/components/schemas/AdminStudentReviewRequiredPage"}
    ):
        fail("review-required endpoint must return AdminStudentReviewRequiredPage")
    review_page = schema(document, "AdminStudentReviewRequiredPage")
    if (
        set(review_page.get("required", [])) != {"items", "page"}
        or set(schema_properties(document, "AdminStudentReviewRequiredPage"))
        != {"items", "page"}
        or review_page.get("additionalProperties") is not False
        or review_page.get("x-authoritative-total-field") != "page.totalItems"
    ):
        fail("review-required response must be exactly {items,page} with authoritative page.totalItems")
    review_fields = {
        "studentId",
        "sourceStudentNo",
        "branch",
        "name",
        "originalClassName",
        "mathClassName",
        "scienceClassNames",
        "reasonCodes",
        "rawClassNames",
        "rawRepresentativeClassNames",
    }
    review_item = schema(document, "AdminStudentReviewRequired")
    review_properties = schema_properties(document, "AdminStudentReviewRequired")
    if (
        set(review_item.get("required", [])) != review_fields
        or set(review_properties) != review_fields
        or review_item.get("additionalProperties") is not False
    ):
        fail("review-required item does not match the runtime popover projection")
    if set(schema(document, "AdminStudentReviewReasonCode").get("enum", [])) != {
        "MULTIPLE_MATH_CLASS",
        "NO_RECOGNIZABLE_CLASS",
        "UNIT_UNRESOLVED",
        "ABNORMAL_OR_EMPTY_CLASS",
    }:
        fail("review-required reasonCodes must use the fixed anomaly enum")
    reason_codes = review_properties.get("reasonCodes", {})
    if (
        reason_codes.get("type") != "array"
        or reason_codes.get("minItems") != 1
        or reason_codes.get("uniqueItems") is not True
        or reason_codes.get("items")
        != {"$ref": "#/components/schemas/AdminStudentReviewReasonCode"}
    ):
        fail("review-required reasonCodes must be a non-empty unique fixed-enum array")
    raw_class_names = review_properties.get("rawClassNames", {})
    raw_class_items = raw_class_names.get("items", {})
    if (
        raw_class_names.get("type") != "array"
        or raw_class_names.get("uniqueItems") is not True
        or raw_class_names.get("x-source-preservation")
        != "VERBATIM_ACTIVE_ASSIGNMENT_VALUES"
        or raw_class_items.get("type") != "string"
        or raw_class_items.get("maxLength") != 300
        or "minLength" in raw_class_items
    ):
        fail("review-required rawClassNames must preserve invalid and empty active source values")

    classification = schema(document, "StudentClassificationSummary")
    required_summary = set(CANONICAL_CONSTANTS) - {
        "rawFetchedAssignmentCount",
        "bracketExcludedAssignmentCount",
        "includedAssignmentCount",
    }
    if not required_summary.issubset(set(classification.get("required", []))):
        fail("StudentClassificationSummary is missing classification fields")

    admin_unit_name = schema_properties(document, "AdminStudent").get("unitName", {})
    if set(admin_unit_name.get("enum", [])) != {
        "과학", "예고1", "특목", "예중1", "초등", "고등", "중등1", "중등2", "중등3", None,
    }:
        fail("AdminStudent.unitName must expose only canonical unit values")

    student_facets = schema(document, "AdminStudentFacets")
    if set(student_facets.get("required", [])) != {"teachers"}:
        fail("AdminStudentFacets must require exactly teachers")
    teacher_facets = schema_properties(document, "AdminStudentFacets").get("teachers", {})
    if (
        teacher_facets.get("type") != "array"
        or teacher_facets.get("uniqueItems") is not True
        or teacher_facets.get("items", {}).get("type") != "string"
        or teacher_facets.get("x-homeroom-applicability")
        != "MATH_REGULAR_CLASS_ONLY"
        or teacher_facets.get("x-science-only-policy") != "EXCLUDED"
    ):
        fail("AdminStudentFacets.teachers must be a unique math-only homeroom array")
    admin_student_page = schema(document, "AdminStudentPage")
    if "facets" not in set(admin_student_page.get("required", [])):
        fail("AdminStudentPage must require page-independent facets")
    if schema_properties(document, "AdminStudentPage").get("facets", {}).get("$ref") != (
        "#/components/schemas/AdminStudentFacets"
    ):
        fail("AdminStudentPage.facets must use AdminStudentFacets")

    admin_student = schema(document, "AdminStudent")
    admin_student_fields = set(schema_properties(document, "AdminStudent"))
    admin_student_required = admin_student.get("required", [])
    if not isinstance(admin_student_required, list) or "teacherName" not in admin_student_required:
        fail("AdminStudent must require its nullable math-only homeroom teacherName")
    teacher_name = schema_properties(document, "AdminStudent").get("teacherName", {})
    teacher_name_types = teacher_name.get("type", [])
    teacher_policy_metadata = {
        "x-required-nullable": True,
        "x-homeroom-applicability": "MATH_REGULAR_CLASS_ONLY",
        "x-source-field": "students.teacher_name",
        "x-source-condition": "MATH_CLASS_PRESENT",
        "x-normalization": "NFKC_TRIM_FIRST_COMMA_VALUE",
        "x-science-only-policy": "RETURN_NULL",
        "x-no-math-policy": "RETURN_NULL",
        "x-assignment-teacher-role": "TRACEABILITY_ONLY",
        "x-assignment-teacher-fallback": "forbidden",
    }
    if (
        not isinstance(teacher_name_types, list)
        or len(teacher_name_types) != 2
        or set(teacher_name_types) != {"string", "null"}
        or teacher_name.get("maxLength") != 100
        or any(teacher_name.get(key) != value for key, value in teacher_policy_metadata.items())
    ):
        fail(
            "AdminStudent.teacherName must be required and nullable, return null "
            "without a math class including for science-only students, and use only "
            "the normalized student-row teacher for math students; assignment "
            "teachers must remain traceability-only and never provide a fallback"
        )
    if not {"motherPhone", "fatherPhone"}.issubset(set(admin_student.get("required", []))):
        fail("AdminStudent must require complete motherPhone and fatherPhone fields")
    if {"maskedMotherContact", "maskedFatherContact"} & admin_student_fields:
        fail("AdminStudent must not expose masked parent-contact fields")
    for field in ("motherPhone", "fatherPhone"):
        phone = schema_properties(document, "AdminStudent").get(field, {})
        if (
            set(phone.get("type", [])) != {"string", "null"}
            or phone.get("minLength") != 8
            or phone.get("maxLength") != 15
            or phone.get("pattern") != r"^[0-9]{8,15}$"
        ):
            fail(f"AdminStudent.{field} must be a nullable normalized full phone number")
    public_student_fields = set(schema_properties(document, "PublicStudent"))
    if {
        "contact",
        "maskedContact",
        "motherPhone",
        "fatherPhone",
        "maskedMotherContact",
        "maskedFatherContact",
    } & public_student_fields:
        fail("PublicStudent must exclude every parent-contact field")

    login_password = schema_properties(document, "LoginRequest").get("password", {})
    if login_password.get("minLength") != 5 or login_password.get("maxLength") != 512:
        fail("LoginRequest.password must match the five-to-512-character DTO bounds")

    assignment = schema(document, "StudentSourceAssignment")
    assignment_teacher = schema_properties(document, "StudentSourceAssignment").get("teacherName", {})
    assignment_teacher_types = assignment_teacher.get("type", [])
    if (
        "teacherName" not in set(assignment.get("required", []))
        or not isinstance(assignment_teacher_types, list)
        or len(assignment_teacher_types) != 2
        or set(assignment_teacher_types) != {"string", "null"}
        or assignment_teacher.get("maxLength") != 100
        or assignment_teacher.get("x-semantic-role") != "TRACEABILITY_ONLY"
        or assignment_teacher.get("x-homeroom-source") is not False
    ):
        fail(
            "StudentSourceAssignment.teacherName must be required and nullable "
            "traceability metadata that is never a homeroom source"
        )
    science_rule = assignment.get("x-science-rule", {})
    if science_rule.get("operator") != "startsWithOrContainsAny" or science_rule.get("prefix") != "과":
        fail("science assignment rule must use the confirmed prefix-or-subject-token policy")
    if set(science_rule.get("containsAny", [])) != {"물리", "화학", "생명과학", "생물", "지구과학"}:
        fail("science assignment subject tokens do not match the product rule")
    if science_rule.get("normalizedRepresentativeLabel") != "과학":
        fail("science representative display label must be 과학")
    supplementary = assignment.get("x-supplementary-rule", {})
    if supplementary.get("operator") != "containsAnyCaseInsensitive":
        fail("supplementary assignment rule must be case-insensitive containment")
    if set(supplementary.get("values", [])) != {"특강", "패키지", "입시대비", "TEST"}:
        fail("supplementary assignment exclusions do not match the product rule")

    otp_routes = {
        "requestOtpChallenge": ("/api/v1/public/otp/challenges", "post"),
        "verifyOtpChallenge": (
            "/api/v1/public/otp/challenges/{challengeId}/verify",
            "post",
        ),
    }
    for operation_id, (expected_path, expected_method) in otp_routes.items():
        path, method, operation, path_item = operation_by_id(document, operation_id)
        if (path, method) != (expected_path, expected_method):
            fail(f"{operation_id} has the wrong route")
        if operation.get("x-implementation-status") != "implemented":
            fail(f"{expected_path} must explicitly be implemented")
        if operation.get("x-requires-csrf") is not True:
            fail(f"{expected_path} must require session-bound CSRF")
        parameters = merged_parameters(document, path_item, operation)
        if not has_required_header(parameters, "X-CSRF-Token"):
            fail(f"{expected_path} must require X-CSRF-Token")
        if "503" not in operation.get("responses", {}):
            fail(f"{expected_path} must contract dependency/configuration failure")
    create_otp = operation_by_id(document, "requestOtpChallenge")[2]
    if "201" not in create_otp.get("responses", {}) or "202" in create_otp.get(
        "responses", {}
    ):
        fail("OTP challenge creation must return 201, not deferred 202")
    if set(schema(document, "OtpChallengeAccepted").get("required", [])) != {
        "challengeId",
        "expiresAt",
        "retryAfterSeconds",
    }:
        fail("OTP challenge response must expose challengeId, expiresAt, and retryAfterSeconds")
    otp_request = schema(document, "OtpChallengeRequest")
    otp_request_properties = schema_properties(document, "OtpChallengeRequest")
    if set(otp_request.get("required", [])) != {"contact", "purpose"}:
        fail("OTP challenge must require generic parent contact and purpose")
    if "motherContact" in otp_request_properties or "branch" not in otp_request_properties:
        fail("OTP challenge must use contact and expose optional non-null branch")
    otp_branch = dereference(document, otp_request_properties["branch"])
    if set(otp_branch.get("enum", [])) != {"CAMPUS_A", "CAMPUS_B", "CAMPUS_C"}:
        fail("OTP challenge branch must use the concrete Branch enum")
    verify_otp = operation_by_id(document, "verifyOtpChallenge")[2]
    if verify_otp.get("x-secret-response-once") != "bookingProof":
        fail("OTP verification must mark bookingProof as a one-time secret response")
    if verify_otp.get("x-proof-storage") != "sha256-digest-only":
        fail("OTP verification must persist only the booking proof digest")
    expected_consumption = {
        "FAMILY_BOOKING": "read-students-until-consumed-by-create",
        "BOOKING_MANAGE": "read-booking-until-consumed-by-update-or-cancel",
    }
    if verify_otp.get("x-proof-consumption") != expected_consumption:
        fail("OTP proof read/consume/reuse semantics are incomplete")
    proof_union = schema(document, "OtpProofIssued").get("oneOf")
    if proof_union != [
        {"$ref": "#/components/schemas/FreshOtpProofIssued"},
        {"$ref": "#/components/schemas/ReplayedOtpProofIssued"},
    ]:
        fail("OTP verification must distinguish fresh and secret-free replay responses")
    fresh_proof = schema(document, "FreshOtpProofIssued")
    replayed_proof = schema(document, "ReplayedOtpProofIssued")
    if set(fresh_proof.get("required", [])) != {
        "bookingProof",
        "expiresAt",
        "scopes",
        "replayed",
    }:
        fail("fresh OTP verification must return bookingProof, expiry, scopes, and replay state")
    if set(replayed_proof.get("required", [])) != {
        "expiresAt",
        "scopes",
        "replayed",
    }:
        fail("OTP replay must return only expiry, scopes, and replay state")
    if "bookingProof" in schema_properties(document, "ReplayedOtpProofIssued"):
        fail("OTP idempotency replay must never return the raw booking proof")
    raw_proof = schema_properties(document, "FreshOtpProofIssued").get(
        "bookingProof", {}
    )
    if (
        not isinstance(raw_proof, Mapping)
        or raw_proof.get("minLength") != 43
        or raw_proof.get("maxLength") != 43
        or raw_proof.get("pattern") != r"^[A-Za-z0-9_-]{43}$"
    ):
        fail("bookingProof must be an unpadded 256-bit base64url bearer secret")
    if "otpProofId" in {
        str(key)
        for name in ("FreshOtpProofIssued", "ReplayedOtpProofIssued")
        for key in schema_properties(document, name)
    }:
        fail("UUID otpProofId bearer credentials are forbidden")
    expected_scopes = {
        "FAMILY_BOOKING": ["STUDENT_SEARCH", "FAMILY_BOOKING"],
        "BOOKING_MANAGE": ["BOOKING_READ", "BOOKING_MANAGE"],
    }
    if schema(document, "OtpPurpose").get("x-proof-scopes") != expected_scopes:
        fail("OtpPurpose must define the exact purpose-derived proof scopes")

    owned_path, owned_method, owned_operation, _ = operation_by_id(
        document, "listOwnedFamilyBookings"
    )
    if (owned_path, owned_method) != ("/api/v1/public/family-bookings", "get"):
        fail("owned family booking list has the wrong route")
    if operation_security_names(owned_operation) != {"bookingProof"}:
        fail("owned family booking list must use X-Booking-Proof only")
    if owned_operation.get("x-proof-scopes") != ["BOOKING_READ", "BOOKING_MANAGE"]:
        fail("owned family booking list must require BOOKING_READ and BOOKING_MANAGE")
    if set(schema(document, "OwnedFamilyBookingList").get("required", [])) != {"items"}:
        fail("owned family booking list response must require items")

    read_session_path, read_session_method, read_session_operation, read_session_path_item = operation_by_id(
        document, "establishFamilyBookingContactReadSession"
    )
    if (read_session_path, read_session_method) != (
        "/api/v1/public/family-bookings/{familyBookingId}/read-session",
        "post",
    ):
        fail("contact-owned booking read session has the wrong route")
    if read_session_operation.get("x-mutation-kind") != "durable":
        fail("contact-owned booking read session must be a durable session mutation")
    if read_session_operation.get("x-idempotency") != "required":
        fail("contact-owned booking read session must require idempotency")
    if read_session_operation.get("x-requires-csrf") is not True:
        fail("contact-owned booking read session must require CSRF")
    if read_session_operation.get("x-requires-same-origin") is not True:
        fail("contact-owned booking read session must require same-origin validation")
    if read_session_operation.get("x-access-session-authorization") != "read-and-existing-qr-only":
        fail("contact-owned booking session must be explicitly read/QR-only")
    read_session_parameters = merged_parameters(
        document, read_session_path_item, read_session_operation
    )
    for header_name in ("Idempotency-Key", "X-CSRF-Token", "Origin"):
        if not has_required_header(read_session_parameters, header_name):
            fail(f"contact-owned booking read session must require {header_name}")
    read_session_request = schema(document, "PublicFamilyBookingReadSessionRequest")
    if set(read_session_request.get("required", [])) != {"contact"}:
        fail("contact-owned booking read session must require only contact")
    if set(schema_properties(document, "PublicFamilyBookingReadSessionRequest")) != {"contact"}:
        fail("contact-owned booking read session request must not accept authority hints")
    if not {"401", "429"}.issubset(read_session_operation.get("responses", {})):
        fail("contact-owned booking read session must contract generic invalid and rate-limited responses")

    survey_path, survey_method, survey_operation, survey_path_item = operation_by_id(
        document, "submitFamilyBookingSurveyResponse"
    )
    if (survey_path, survey_method) != (
        "/api/v1/public/family-bookings/{familyBookingId}/survey-response",
        "post",
    ):
        fail("public survey submission has the wrong route")
    if operation_security_names(survey_operation) != {"bookingProof"}:
        fail("public survey submission must use X-Booking-Proof only")
    if survey_operation.get("x-proof-scopes") != ["BOOKING_MANAGE"]:
        fail("public survey submission must require BOOKING_MANAGE")
    if "201" not in survey_operation.get("responses", {}):
        fail("public survey submission must return 201")
    # The survey response is a durable BOOKING_MANAGE mutation. It must sit behind
    # the same syntactic booking-proof + session-bound CSRF (including same-origin)
    # gate as the public family-booking update and cancel, and consume the proof on
    # the first successful management mutation. Lock every leg so a future edit
    # cannot silently drop CSRF, the Origin/same-origin check, idempotency, or the
    # proof-consumption contract for this exact endpoint.
    survey_parameters = merged_parameters(document, survey_path_item, survey_operation)
    if survey_operation.get("x-mutation-kind") != "durable":
        fail("public survey submission must be a durable mutation")
    if survey_operation.get("x-idempotency") != "required":
        fail("public survey submission must require idempotency")
    if not has_required_header(survey_parameters, "Idempotency-Key"):
        fail("public survey submission must require Idempotency-Key")
    if survey_operation.get("x-proof-consumption") != (
        "consumed-by-first-successful-management-mutation"
    ):
        fail("public survey submission must consume the proof on first successful mutation")
    if survey_operation.get("x-access-session-authorization") != "forbidden":
        fail("public survey submission must forbid access-session authorization")
    if survey_operation.get("x-requires-csrf") is not True:
        fail("public survey submission must require session-bound CSRF")
    if not has_required_header(survey_parameters, "X-CSRF-Token"):
        fail("public survey submission must require X-CSRF-Token")
    if survey_operation.get("x-requires-same-origin") is not True:
        fail("public survey submission must require same-origin validation")
    if not has_required_header(survey_parameters, "Origin"):
        fail("public survey submission must require the Origin header")
    survey_request = schema(document, "PublicSurveyResponseCreateRequest")
    if set(survey_request.get("required", [])) != {"rating"}:
        fail("public survey request must require rating")
    if {"photoAttached", "photoName"} & set(schema_properties(document, "PublicSurveyResponseCreateRequest")):
        fail("public survey request must not expose mock photo metadata")
    survey_response = schema(document, "SurveyResponse")
    survey_fields = set(schema_properties(document, "SurveyResponse"))
    if {"photoAttached", "photoName"} & survey_fields:
        fail("SurveyResponse must not expose mock photo metadata")
    if "participant" not in set(survey_response.get("required", [])) or survey_fields & {
        "contact",
        "maskedContact",
        "students",
        "studentName",
    }:
        fail("SurveyResponse must nest its ADMIN-only participant context")
    if schema_properties(document, "SurveyResponse").get("participant") != {
        "$ref": "#/components/schemas/SurveyParticipantContext"
    }:
        fail("SurveyResponse.participant must use SurveyParticipantContext")
    participant_context = schema(document, "SurveyParticipantContext")
    expected_participant_fields = {
        "participantType",
        "studentId",
        "sourceStudentNo",
        "branch",
        "unitName",
        "studentName",
        "className",
        "teacherName",
        "contact",
        "participantCount",
        "additionalParticipantCount",
    }
    if (
        set(participant_context.get("required", [])) != expected_participant_fields
        or set(schema_properties(document, "SurveyParticipantContext"))
        != expected_participant_fields
    ):
        fail("SurveyParticipantContext does not match the runtime representative mapping")
    participant_contact = schema_properties(
        document, "SurveyParticipantContext"
    ).get("contact", {})
    if (
        participant_contact.get("type") != "string"
        or participant_contact.get("minLength") != 8
        or participant_contact.get("maxLength") != 15
        or participant_contact.get("pattern") != r"^[0-9]{8,15}$"
    ):
        fail("survey participant contact must be a normalized full ADMIN-only phone")

    admin_survey_path, admin_survey_method, admin_survey, _ = operation_by_id(
        document, "listSessionSurveyResponses"
    )
    if (admin_survey_path, admin_survey_method) != (
        "/api/v1/admin/seminar-sessions/{seminarSessionId}/survey-responses",
        "get",
    ):
        fail("admin survey response list has the wrong route")
    if operation_security_names(admin_survey) != {"cookieAuth"}:
        fail("admin survey response list must use ADMIN cookie authentication")
    if admin_survey.get("x-required-roles") != ["ADMIN"]:
        fail("admin survey response list must require ADMIN")

    sms_routes = {
        "getSmsGatewayReadiness": ("/api/v1/admin/sms/gateway-readiness", "get"),
        "listSmsTemplates": ("/api/v1/admin/sms/templates", "get"),
        "createSmsTemplate": ("/api/v1/admin/sms/templates", "post"),
        "getSmsTemplate": ("/api/v1/admin/sms/templates/{templateId}", "get"),
        "updateSmsTemplate": ("/api/v1/admin/sms/templates/{templateId}", "patch"),
        "archiveSmsTemplate": ("/api/v1/admin/sms/templates/{templateId}", "delete"),
        "previewSmsTargets": ("/api/v1/admin/sms/targets/preview", "post"),
        "enqueueSmsSend": ("/api/v1/admin/sms/sends", "post"),
        "enqueueSurveySmsSend": ("/api/v1/admin/sms/survey-sends", "post"),
        "listSmsMessages": ("/api/v1/admin/sms/messages", "get"),
        "getSmsMessage": ("/api/v1/admin/sms/messages/{messageId}", "get"),
    }
    for operation_id, expected_route in sms_routes.items():
        path, method, operation, _ = operation_by_id(document, operation_id)
        if (path, method) != expected_route:
            fail(f"{operation_id} has the wrong SMS route")
        if operation_security_names(operation) != {"cookieAuth"}:
            fail(f"{operation_id} must use ADMIN cookie authentication")
        if operation.get("x-required-roles") != ["ADMIN"]:
            fail(f"{operation_id} must require ADMIN")
    if operation_by_id(document, "previewSmsTargets")[2].get("x-mutation-kind") != (
        "ephemeral"
    ):
        fail("SMS target preview must remain an ephemeral, non-idempotent calculation")
    for operation_id in ("enqueueSmsSend", "enqueueSurveySmsSend"):
        if "202" not in operation_by_id(document, operation_id)[2].get("responses", {}):
            fail(f"{operation_id} must return 202 after durable queueing")
    archive_path, _, archive_operation, archive_item = operation_by_id(
        document, "archiveSmsTemplate"
    )
    archive_parameters = merged_parameters(document, archive_item, archive_operation)
    if not has_required_header(archive_parameters, "If-Match"):
        fail(f"DELETE {archive_path} must require If-Match version")
    if "200" not in archive_operation.get("responses", {}):
        fail("template removal must return the conditional lifecycle result with 200")
    if (
        archive_operation.get("x-hard-delete") != "conditional-unused"
        or archive_operation.get("x-delete-missing") != "not-found-except-idempotency-replay"
        or archive_operation.get("x-delete-dependencies") != {
            "smsOutboxSnapshots": "preserve",
            "activeDefault": "reassign-before-removal",
        }
    ):
        fail("template removal must contract unused deletion, history archival, and default reassignment")
    removal_schema = schema(document, "SmsTemplateRemovalResult")
    if set(removal_schema.get("required", [])) != {
        "templateId", "disposition", "usageCount", "archivedTemplate"
    }:
        fail("SmsTemplateRemovalResult must expose the deterministic lifecycle outcome")

    if set(schema(document, "SmsPurpose").get("enum", [])) != EXPECTED_SMS_PURPOSES:
        fail("SmsPurpose does not match the durable source enum")
    if set(schema(document, "SmsDeliveryStatus").get("enum", [])) != (
        EXPECTED_SMS_DELIVERY_STATUSES
    ):
        fail("SmsDeliveryStatus does not match the outbox state machine")
    if set(schema(document, "SmsAttemptResult").get("enum", [])) != (
        EXPECTED_SMS_ATTEMPT_RESULTS
    ):
        fail("SmsAttemptResult does not match append-only delivery attempts")
    for request_name, expected_properties in (
        (
            "SmsTargetRequest",
            {"branch", "seminarSessionId", "audience", "templateId", "message", "title"},
        ),
        (
            "SmsEnqueueRequest",
            {
                "branch",
                "seminarSessionId",
                "audience",
                "templateId",
                "message",
                "title",
                "previewToken",
            },
        ),
    ):
        request_schema = schema(document, request_name)
        if set(schema_properties(document, request_name)) != expected_properties:
            fail(f"{request_name} has unexpected target fields")
        if not isinstance(request_schema.get("oneOf"), list) or len(
            request_schema["oneOf"]
        ) != 2:
            fail(f"{request_name} must require exactly one of templateId or message")
    safe_sms_fields = set(schema_properties(document, "SmsMessageSummary"))
    forbidden_sms_fields = {
        "message",
        "body",
        "title",
        "recipient",
        "recipientContact",
        "recipientCiphertext",
    }
    if safe_sms_fields & forbidden_sms_fields:
        fail("SMS history must never expose content or a full recipient")
    if "attempts" not in schema_properties(document, "SmsMessageDetail"):
        fail("SMS message detail must include append-only attempts")

    sheets_routes = {
        "getGoogleSheetsReadiness": ("/api/v1/admin/sheets/readiness", "get"),
        "listGoogleSheetsMappings": ("/api/v1/admin/sheets/mappings", "get"),
        "listGoogleSheetsDeliveries": ("/api/v1/admin/sheets/deliveries", "get"),
        "getGoogleSheetsDelivery": (
            "/api/v1/admin/sheets/deliveries/{deliveryId}",
            "get",
        ),
    }
    for operation_id, expected_route in sheets_routes.items():
        path, method, operation, _ = operation_by_id(document, operation_id)
        if (path, method) != expected_route:
            fail(f"{operation_id} has the wrong Google Sheets route")
        if operation_security_names(operation) != {"cookieAuth"}:
            fail(f"{operation_id} must use ADMIN cookie authentication")
        if operation.get("x-required-roles") != ["ADMIN"]:
            fail(f"{operation_id} must require ADMIN")
    for path, path_item in paths.items():
        if str(path).startswith("/api/v1/admin/sheets/"):
            methods = {method for method in path_item if method in HTTP_METHODS}
            if methods != {"get"}:
                fail(f"Google Sheets admin route must remain read-only: {path}")
    if set(schema(document, "GoogleSheetsDeliveryStatus").get("enum", [])) != (
        EXPECTED_SHEETS_DELIVERY_STATUSES
    ):
        fail("GoogleSheetsDeliveryStatus does not match the outbox state machine")
    if set(schema(document, "GoogleSheetsAttemptResult").get("enum", [])) != (
        EXPECTED_SHEETS_ATTEMPT_RESULTS
    ):
        fail("GoogleSheetsAttemptResult does not match append-only attempts")
    sheet_projection = document.get("info", {}).get("x-google-sheets-projection", {})
    if not isinstance(sheet_projection, Mapping):
        fail("Google Sheets outbound projection policy is missing")
    if sheet_projection.get("authority") != "POSTGRESQL":
        fail("PostgreSQL must remain the Google Sheets projection authority")
    if sheet_projection.get("direction") != "POSTGRESQL_TO_GOOGLE_SHEETS_ONLY":
        fail("Google Sheets projection must remain outbound-only")
    if sheet_projection.get("inboundSyncSupported") is not False:
        fail("Google Sheets inbound synchronization must remain forbidden")
    if sheet_projection.get("delivery") != "DURABLE_TRANSACTIONAL_OUTBOX":
        fail("Google Sheets projection must use a durable transactional outbox")
    if sheet_projection.get("schemaVersion") != 4:
        fail("Google Sheets projection must match runtime schema version 4")
    if set(sheet_projection.get("events", [])) != {
        "CREATED",
        "UPDATED",
        "CANCELLED",
        "CHECKED_IN",
    }:
        fail("Google Sheets outbound event set is incomplete")
    if sheet_projection.get("checkInProjection") != "FIRST_SUCCESSFUL_QR_CHECK_IN_ONLY":
        fail("Google Sheets must project only the first successful QR check-in")
    if sheet_projection.get("reservationSheet") != {
        "title": "예약명단",
        "sheetId": 1777564107,
        "businessRange": "A:M",
        "reservedBlankRange": "N:AC",
        "sourceStudentNoDisplayColumn": "B",
        "rowIdentity": "FAMILY_BOOKING_STUDENT_ID_ONLY",
        "valueInputMode": "RAW",
        "postWriteExactVerification": True,
    }:
        fail("Google Sheets reservation sheet metadata does not match runtime v4")
    if sheet_projection.get("familySummarySheet") != {
        "title": "예약집계",
        "sheetId": 202607180,
        "businessRange": "A:M",
        "reservedBlankRange": "N:Y",
        "valueInputMode": "RAW",
        "postWriteExactVerification": True,
    }:
        fail("Google Sheets family summary metadata does not match runtime v4")
    if sheet_projection.get("bookingLogSheet") != {
        "title": "로그",
        "sheetId": 1415280656,
        "businessRange": "A:M",
        "reservedBlankRange": "N:Y",
        "valueInputMode": "RAW",
        "appendOnly": True,
        "postWriteExactVerification": True,
    }:
        fail("Google Sheets booking log metadata does not match runtime v4")
    marker_columns = sheet_projection.get("technicalMarkerColumns", {})
    expected_markers = {
        "reservationRoster": {
            "sheetTitle": "예약명단",
            "column": "AD",
            "header": "__NPR_FAMILY_BOOKING_STUDENT_ID",
            "value": "familyBookingStudentId",
            "hidden": True,
            "protected": True,
            "bootstrap": "INITIALIZE_IF_BLANK_IDEMPOTENTLY",
            "conflictingHeader": "BLOCK_WITH_SCHEMA_DRIFT",
        },
        "familySummary": {
            "sheetTitle": "예약집계",
            "column": "Z",
            "header": "__NPR_FAMILY_BOOKING_ID",
            "value": "familyBookingId",
            "hidden": True,
            "protected": True,
            "bootstrap": "INITIALIZE_IF_BLANK_IDEMPOTENTLY",
            "conflictingHeader": "BLOCK_WITH_SCHEMA_DRIFT",
        },
        "bookingLog": {
            "sheetTitle": "로그",
            "column": "Z",
            "header": "__NPR_BOOKING_EVENT_ID",
            "value": "eventId",
            "hidden": True,
            "protected": True,
            "bootstrap": "INITIALIZE_IF_BLANK_IDEMPOTENTLY",
            "conflictingHeader": "BLOCK_WITH_SCHEMA_DRIFT",
        },
    }
    if marker_columns != expected_markers:
        fail("Google Sheets hidden/protected idempotency marker columns changed")
    expected_visible_headers = {
        "reservationRosterAtoM": [
            "예약일시",
            "학번",
            "캠퍼스",
            "학생명",
            "수학반",
            "과학반",
            "학교",
            "학년",
            "담임",
            "학부모HP (모)",
            "학부모HP (부)",
            "예약상태",
            "로그",
        ],
        "familySummaryAtoM": [
            "예약일시",
            "가족예약ID",
            "캠퍼스",
            "학생명 목록",
            "참석자",
            "예약건수",
            "예약인원",
            "입장건수",
            "입장인원",
            "상태",
            "예약경로",
            "체크인시각",
            "최신로그",
        ],
        "bookingLogAtoM": [
            "이벤트일시",
            "이벤트",
            "가족예약ID",
            "캠퍼스",
            "학생수",
            "학생명",
            "참석자",
            "예약인원",
            "입장인원",
            "예약상태",
            "예약경로",
            "처리자",
            "로그",
        ],
    }
    if sheet_projection.get("visibleHeaders") != expected_visible_headers:
        fail("Google Sheets visible header order or wording changed")
    if sheet_projection.get("campusValues") != {
        "CAMPUS_A": "A",
        "CAMPUS_B": "B",
        "CAMPUS_C": "C",
    }:
        fail("Google Sheets campus projection values do not match runtime v4")
    if sheet_projection.get("reservationStateValues") != {
        "reservedMother": "예약 (모)",
        "reservedFather": "예약 (부)",
        "reservedBoth": "예약 (모/부)",
        "cancelled": "예약취소",
        "checkedIn": "입장 완료",
        "noShow": "미참석",
    }:
        fail("Google Sheets reservation state values do not match runtime v4")
    if sheet_projection.get("markerUniqueness") != {
        "reservationRoster": "EXACTLY_ONE_PER_FAMILY_BOOKING_STUDENT_ID",
        "familySummary": "EXACTLY_ONE_PER_FAMILY_BOOKING_ID",
        "bookingLog": "EXACTLY_ONE_PER_BOOKING_EVENT_ID",
        "staleDuplicatePolicy": "KEEP_ONE_MATCHING_PROJECTION_AND_CLEAR_OTHER_TECHNICAL_MARKERS",
    }:
        fail("Google Sheets marker uniqueness policy changed")
    sheet_mutation_events = {
        "createPublicFamilyBooking": "CREATED",
        "updatePublicFamilyBooking": "UPDATED",
        "cancelPublicFamilyBooking": "CANCELLED",
        "createAdminFamilyBooking": "CREATED",
        "updateAdminFamilyBooking": "UPDATED",
        "cancelAdminFamilyBooking": "CANCELLED",
        "checkInFamilyByQr": "CHECKED_IN_FIRST_SUCCESS_ONLY",
    }
    for operation_id, event_type in sheet_mutation_events.items():
        _, _, operation, _ = operation_by_id(document, operation_id)
        if operation.get("x-google-sheets-outbox-event") != event_type:
            fail(f"{operation_id} must declare Google Sheets event {event_type}")
    readiness_properties = schema_properties(document, "GoogleSheetsReadiness")
    outbound_supported = readiness_properties.get("outboundProjectionSupported", {})
    inbound_supported = readiness_properties.get("inboundSyncSupported", {})
    live_writes = readiness_properties.get("liveWritesSupported", {})
    if not isinstance(outbound_supported, Mapping) or outbound_supported.get("const") is not True:
        fail("Google Sheets outbound capability must be explicit")
    if not isinstance(inbound_supported, Mapping) or inbound_supported.get("const") is not False:
        fail("Google Sheets inbound capability must remain false")
    if not isinstance(live_writes, Mapping) or live_writes.get("type") != "boolean" or "const" in live_writes:
        fail("Google Sheets liveWritesSupported must represent deployment readiness")
    required_readiness = set(schema(document, "GoogleSheetsReadiness").get("required", []))
    for field in {
        "adapterAvailable",
        "outboundProjectionSupported",
        "inboundSyncSupported",
        "liveWritesSupported",
        "blockReasonCode",
    }:
        if field not in required_readiness:
            fail(f"GoogleSheetsReadiness must require {field}")
    forbidden_sheet_fields = {
        "snapshot",
        "snapshotCiphertext",
        "spreadsheetId",
        "credentialPath",
        "studentName",
        "parentContact",
    }
    if set(schema_properties(document, "GoogleSheetsDeliverySummary")) & (
        forbidden_sheet_fields
    ):
        fail("Google Sheets delivery history exposes sensitive projection payload data")

    fresh_booking = schema_properties(document, "FreshFamilyBookingMutation")
    replay_booking = schema_properties(document, "ReplayedFamilyBookingMutation")
    if "qrToken" not in fresh_booking or "qrToken" in replay_booking:
        fail("family booking replay must never return raw qrToken")
    fresh_rotation = schema_properties(document, "FreshQrRotation")
    replay_rotation = schema_properties(document, "ReplayedQrRotation")
    if "qrToken" not in fresh_rotation or "qrToken" in replay_rotation:
        fail("QR rotation replay must never return raw qrToken")
    fresh_pairing = schema_properties(document, "FreshPairingCode")
    replay_pairing = schema_properties(document, "ReplayedPairingCode")
    if "pairingCode" not in fresh_pairing or "pairingCode" in replay_pairing:
        fail("pairing code replay must never return the raw pairingCode")

    pairing_ttl = (
        schema(document, "PairingCodeMetadata")
        .get("properties", {})
        .get("ttlSeconds", {})
        .get("const")
    )
    if pairing_ttl != 300:
        fail("pairing code TTL must be exactly five minutes (300 seconds)")


def validate_append_only_descriptions(document: Mapping[str, Any]) -> None:
    by_id = {
        operation["operationId"]: operation
        for _, _, operation, _ in iter_operations(document)
    }
    for operation_id in AUDIT_OPERATION_IDS:
        description = " ".join(
            str(by_id[operation_id].get(key, ""))
            for key in ("summary", "description")
        ).casefold()
        if not any(word in description for word in ("append-only", "immutable")):
            fail(f"{operation_id} must state append-only or immutable chronology")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "contract",
        nargs="?",
        default="openapi.yaml",
        type=Path,
        help="OpenAPI YAML file (default: openapi.yaml)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        document = load_contract(args.contract)
        validate_document_shape(document)
        validate_internal_references(document)
        validate_security(document)
        operation_count, durable_count, ephemeral_count = validate_operations(document)
        validate_domain_invariants(document)
        validate_append_only_descriptions(document)
    except (ContractValidationError, OSError) as exc:
        print(f"OpenAPI validation failed: {exc}", file=sys.stderr)
        return 1

    path_count = len(document["paths"])
    schema_count = len(document["components"]["schemas"])
    print(
        f"OpenAPI validation passed: {args.contract} "
        f"({path_count} paths, {operation_count} operations, "
        f"{schema_count} schemas, {durable_count} durable mutations, "
        f"{ephemeral_count} ephemeral mutations)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
