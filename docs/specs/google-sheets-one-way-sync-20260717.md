# Google Sheets one-way sync decisions (schema v3, 2026-07-18)

## Direction and authority

- Target workbook: `26년 대입설명회`.
- Direction: PostgreSQL -> Google Sheets only.
- PostgreSQL is the sole authority. Sheet values, edits, formulas, and
  timestamps never create or change application state.
- A booking/check-in transaction commits independently of Google availability.
  It atomically creates a durable outbox delivery that the isolated worker
  processes after the domain transaction commits.
- Schema v3 is a current-state projection to `예약명단` only. It does not import
  Sheet data and does not project to branch rosters or an append-only log tab.

## Verified live workbook layout

The live read-only evidence used for v3 is:

- workbook title: `26년 대입설명회`;
- locale: `ko_KR`;
- time zone: `Asia/Seoul`;
- exact projection tab: `예약명단`, `sheetId=1777564107`, 30 columns;
- separate tab: `로그`, `sheetId=1415280656`, 26 columns, currently blank.

### `예약명단` business projection

Row 1 A:L is exact and ordered:

| Column | Header | PostgreSQL-derived value |
| --- | --- | --- |
| A | 예약일시 | Family booking creation time formatted in `Asia/Seoul` |
| B | 학번 | Source student number snapshot; visible student lookup key |
| C | 캠퍼스 | Exhaustive mapping from `selected.branchCodeAtBooking` |
| D | 학생명 | Student name snapshot |
| E | 반명 | Class name snapshot |
| F | 학교 | School name snapshot |
| G | 학년 | Grade snapshot |
| H | 담임 | Primary teacher derived from the teacher snapshot |
| I | 학부모HP (모) | Authorized mother contact projection |
| J | 학부모HP (부) | Authorized father contact projection |
| K | 예약상태 | Current reservation/check-in state |
| L | 로그 | Latest operational booking event label and event time |

Campus values are fixed:

| `branchCodeAtBooking` | C 캠퍼스 |
| --- | --- |
| `CAMPUS_A` | `A` |
| `CAMPUS_B` | `B` |
| `CAMPUS_C` | `C` |

An unknown or null branch code is not guessed or copied from Sheets. Projection
planning fails closed before any row dispatch write.

Row 1 M:AC is exactly 17 blank reserved cells. Runtime never writes M:AC. AD is
column index 29 and must remain there:

- AD1 header: `__NPR_FAMILY_BOOKING_STUDENT_ID`;
- row value: stable family-booking-student projection identity;
- hidden: yes;
- protected: yes;
- requesting user can edit: yes;
- allowed protected-range editors: the service account and Drive owner;
- moving the marker away from AD or changing the header is schema drift.

The L header/value is part of each `예약명단` current-state row. It must not be
confused with the separate `로그` tab.

### Separate `로그` tab

The exact live tab is `로그`, `sheetId=1415280656`, with 26 columns. It is blank
and outside the schema-v3 runtime projection. Preparation, validation, dispatch,
post-verification, reconciliation, and retry logic perform no cell read or write
against it. Schema v3 does not implement an append-only Sheet log.

## Schema v3 identity

Canonical descriptor:

```text
sheet:예약명단#1777564107|columns:30|A:L:예약일시,학번,캠퍼스,학생명,반명,학교,학년,담임,학부모HP (모),학부모HP (부),예약상태,로그|M:AC:blank|AD:hidden+protected:__NPR_FAMILY_BOOKING_STUDENT_ID|v3
```

SHA-256 fingerprint:

```text
1428b95585de0ca4734d1fadab8ae141f6f7e8c2f371e4c6f3aad1ddece7751d
```

Both `schema_version=3` and this exact fingerprint are required. A v2 mapping,
or a row with only one of the two v3 values, is stale and cannot be claimed or
dispatched.

## Dispatch and idempotency

Each outbox delivery is resolved to the latest PostgreSQL projection at dispatch
time. The worker then:

1. validates the allowlisted spreadsheet, safe Drive sharing, locale, time zone,
   exact reservation tab ID/title/width, exact A:L headers, blank M1:AC1, and AD
   marker safety;
2. locates a row by AD marker and B student key, using B only as a nonblank
   recovery key when a manual sort detached the marker;
3. writes exactly `예약명단!A{row}:L{row}` using `RAW` and
   `예약명단!AD{row}` for the stable marker;
4. clears duplicate AD markers for the same projection identity without writing
   another tab;
5. rereads `예약명단` and requires exactly one AD marker plus exact B and A:L
   values before reporting success.

Formula-like user data is escaped before the RAW projection. Guest rows with a
blank B value never use blank B as a cross-row identity fallback; their AD marker
remains authoritative. An uncertain write is retried and reconciled against the
same marker so it cannot create a second current-state row.

Normal dispatch is strictly non-bootstrapping. Missing, visible, unprotected,
misprotected, moved, or conflicting technical-marker state blocks the mapping.

## Explicit preparation and activation

Preparation and enablement remain separate operations:

1. `prepare` confirms the mapping/spreadsheet identity, validates sharing and
   the v3 business schema, and is the only operation allowed to initialize a
   blank AD1 marker, hide AD, or add its protection.
2. Preparation is idempotent. If AD already has the exact safe v3 marker state,
   it performs no marker mutation.
3. Preparation leaves the mapping disabled and `BLOCKED` with
   `GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED`.
4. `enable` requires the global worker flag, repeats strict read-only validation,
   and only then changes the mapping to `enabled=true / CLOSED`.
5. Dispatch never calls preparation and never repairs schema.

Public/link, domain-wide, or group sharing; a non-Google or trashed workbook;
missing direct service-account editor access; unsafe marker editors; stale
version/fingerprint; or any header/identity drift fails closed.

## v2 -> v3 mapping migration assessment

Schema v2 projected A:K with `학생명` in C through `로그` in K and kept L:AC
blank. Schema v3 inserts `캠퍼스` at C, shifts the former C:K values to D:L, and
keeps M:AC blank. The B student key and the hidden/protected AD marker do not
move.

No new table, column, constraint, or relation is needed for schema v3. The
existing mapping columns can hold version 3 and its fingerprint, and pending
outbox deliveries can be preserved. The additive data/default migration is
`20260718040000_google_sheets_campus_v3`; production activation still requires
the explicit preparation and enablement steps below.

The migration behavior for every stale v2 mapping is:

- set `schema_version=3`;
- set `schema_fingerprint` to
  `1428b95585de0ca4734d1fadab8ae141f6f7e8c2f371e4c6f3aad1ddece7751d`;
- set `enabled=false`;
- set `circuit_status='BLOCKED'`;
- set `block_reason_code='GOOGLE_SHEETS_V3_PREPARE_REQUIRED'`;
- clear `last_validated_at` and dispatch leases;
- preserve all Sheet outbox and attempt rows;
- change the mapping schema-version default to 3 for future rows.

After that migration, an operator must run explicit v3 `prepare`, inspect the
result, turn on the deployment worker flag through the normal secret-preserving
process, and run explicit `enable`. The mapping must not be auto-enabled by the
migration.

## Security and operations

The worker uses a dedicated service account with Sheets access and Drive
metadata-only access. Credential JSON remains outside Git in an owner-only file;
credential contents, permission email addresses, phone numbers, and projection
payloads are never returned by readiness/delivery APIs or included in error
metadata.

Enabled mappings are periodically revalidated. Permanent credentials, sharing,
schema, or marker failures disable the mapping in a durable `BLOCKED` state.
Transient quota/network/provider failures retry with bounded backoff. Readiness
requires a recent successful worker validation and continues to state explicitly
that outbound projection is supported and inbound synchronization is not.

## Verification gates

1. Unit tests lock the exact v3 descriptor/fingerprint, A:L headers, 17 M:AC
   blanks, all three campus mappings, and null/unknown campus failure.
2. Gateway tests cover exact A:L plus AD writes, B/AD identity recovery,
   duplicate-marker cleanup, uncertain-write replay, and exact post-verification.
3. Preparation tests cover AD stability, hiding/protection, unsafe protection,
   conflicting headers, and idempotent replay.
4. Tests include the real blank `로그` tab identity and prove all cell I/O stays
   under `예약명단!`.
5. Contract validation locks schema v3, A:L, M:AC, campus header/value mappings,
   AD marker policy, PostgreSQL authority, and the absence of inbound sync.
6. Production writes remain disabled until the v3 mapping migration, explicit
   preparation, and explicit enablement have completed.
