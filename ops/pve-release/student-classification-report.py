#!/usr/bin/env python3
"""PII-preserving local report helper; never performs network access."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any


TERMINAL_SUFFIX = re.compile(r"^([^\[\]]+)\[([^\[\]]+)\]$")
WEEKDAY_SUFFIX = re.compile(r"^([월화수목금토일]{1,3})([1-9]\d?)?$")
LATIN_SUFFIX = re.compile(r"^[Ee][1-9]\d?$")
SPECIAL_CLASS = re.compile(r"특강|패키지|입시대비|TEST", re.IGNORECASE)
SCIENCE_CLASS = re.compile(r"물리|화학|생명과학|생물|지구과학")


def normalize(value: object) -> str:
    return unicodedata.normalize("NFKC", str(value)).strip()


def schedule_base(class_name: str) -> str | None:
    normalized = normalize(class_name)
    if "*" in normalized:
        return None
    match = TERMINAL_SUFFIX.fullmatch(normalized)
    if match is None:
        return None
    base_class, suffix = match.groups()
    weekday = WEEKDAY_SUFFIX.fullmatch(suffix)
    valid_weekday = weekday is not None and len(set(weekday.group(1))) == len(weekday.group(1))
    if not valid_weekday and LATIN_SUFFIX.fullmatch(suffix) is None:
        return None
    return base_class.strip()


def allowed_class_name(class_name: str) -> bool:
    class_name = normalize(class_name)
    if not class_name or "*" in class_name:
        return False
    return not ("[" in class_name or "]" in class_name) or schedule_base(class_name) is not None


def allowed(row: dict[str, Any]) -> bool:
    return normalize(row.get("enrollmentStatus", "")) == "재원생" and allowed_class_name(row.get("className", ""))


def base_class(class_name: str) -> str:
    normalized = normalize(class_name)
    return schedule_base(normalized) or normalized


def representative(class_name: str) -> bool:
    normalized = normalize(class_name)
    if not allowed_class_name(normalized):
        return False
    base = base_class(normalized)
    return SPECIAL_CLASS.search(base) is None and not (base == "기하" and base != normalized)


def science(class_name: str) -> bool:
    base = base_class(class_name)
    return base.startswith("과") or SCIENCE_CLASS.search(base) is not None


def clean_tsv(value: object) -> str:
    return re.sub(r"[\t\r\n]", " ", str(value))


def unique_sorted(values: list[str]) -> list[str]:
    return sorted(set(values))


def build_report(source_files: list[Path], rows_path: Path, summary_path: Path) -> None:
    rows: list[dict[str, Any]] = []
    for source_file in source_files:
        rows.extend(json.loads(source_file.read_text(encoding="utf-8")))
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if allowed(row):
            groups[normalize(row.get("studentNo", ""))].append(row)

    report_rows: list[list[str]] = []
    resolved_regular = 0
    resolved_science = 0
    multiple_regular = 0
    no_class = 0
    multiple_assignment = 0
    for assignments in groups.values():
        if len(assignments) > 1:
            multiple_assignment += 1
        regular = unique_sorted([
            base_class(row["className"])
            for row in assignments
            if representative(row["className"]) and not science(row["className"])
        ])
        sciences = unique_sorted([
            base_class(row["className"])
            for row in assignments
            if representative(row["className"]) and science(row["className"])
        ])
        non_representative = unique_sorted([
            normalize(row["className"])
            for row in assignments
            if not representative(row["className"])
        ])
        if len(regular) == 1:
            resolved_regular += 1
            continue
        if len(regular) > 1:
            reason = "MULTIPLE_REGULAR_CLASSES"
            multiple_regular += 1
        elif sciences:
            resolved_science += 1
            continue
        else:
            reason = "NO_REGULAR_OR_SCIENCE_CLASS"
            no_class += 1
        first = assignments[0]
        report_rows.append([
            reason,
            normalize(first.get("branchCode", "")),
            normalize(first.get("studentNo", "")),
            normalize(first.get("name", "")),
            " | ".join(unique_sorted([normalize(row["className"]) for row in assignments])),
            " | ".join(regular),
            " | ".join(sciences),
            " | ".join(non_representative),
        ])

    with rows_path.open("w", encoding="utf-8", newline="") as output:
        for row in report_rows:
            output.write("\t".join(clean_tsv(value) for value in row) + "\n")
    summary_path.write_text(json.dumps({
        "uniqueStudents": len(groups),
        "multipleAssignmentStudents": multiple_assignment,
        "resolvedRegular": resolved_regular,
        "resolvedScience": resolved_science,
        "ambiguousStudents": multiple_regular + no_class,
        "multipleRegularClasses": multiple_regular,
        "noRegularOrScienceClass": no_class,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def self_test() -> None:
    accepted = ["3T3A", "과1특A[토3]", "과고1가람[일4]", "고1수학[월수]", "고1수학[월수금1]", "고1영재[E3]", "고1영재[e3]", " 과학 ［토3］ "]
    rejected = ["[26특-과]과1A", "과학[연장]", "과학[월월]", "과학[일00]", "과학[일01]", "과학[Z99]", "과학*[토3]", "과학[토3][일4]"]
    assert all(allowed({"enrollmentStatus": "재원생", "className": value}) for value in accepted)
    assert not any(allowed({"enrollmentStatus": "재원생", "className": value}) for value in rejected)
    assert base_class("과1특A[토3]") == "과1특A"
    assert base_class(" 과학 ［토3］ ") == "과학"
    assert science("과고1가람[일4]")
    assert allowed({"enrollmentStatus": "재원생", "className": "기하[일1]"})
    assert not representative("기하[일1]")


def main() -> None:
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        print("student classification report fixtures: ok")
        return
    if len(sys.argv) != 6:
        raise SystemExit("usage: student-classification-report.py ROWS SUMMARY SOURCE SOURCE SOURCE")
    build_report(
        [Path(value) for value in sys.argv[3:]],
        Path(sys.argv[1]),
        Path(sys.argv[2]),
    )


if __name__ == "__main__":
    main()
