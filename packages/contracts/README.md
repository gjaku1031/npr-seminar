# NPR Seminar API contract

[openapi.yaml](./openapi.yaml) is the authoritative, language-neutral OpenAPI
3.1 contract shared by the web application and the single NestJS backend.
Database/Prisma models are not API types and must not be imported by the web
application.

The contract defines:

- Redis-backed ADMIN and SCANNER project sessions with same-origin CSRF
  protection.
- Contact-bound public X-Booking-Proof authorization, family-level booking
  seats, and exactly one family QR lifecycle.
- Seminar/session capacity, student assignment resolution, three-branch sync,
  scanner pairing/shift locking/check-in, and append-only audit histories.
- Explicit session scope: `ALL` has `branch: null` and accepts every branch;
  `BRANCH` requires one branch and matching students/scanner devices. The current
  seed session is `ALL` with capacity 800.
- Exact six-character scanner pairing codes, atomic unused-code cancellation,
  administrator and self-unpair hard deletion with check-in preservation,
  revocation preservation, re-pair lifecycle, and nullable battery telemetry
  from scanner heartbeats.
- A booked-only ADMIN session roster with an unpaginated filtered XLSX export,
  family-level operations/statistics summaries, enrolled-student unit rows, and
  explicit guest-only booking count semantics.
- SMS OTP challenge/verification plus ADMIN template management, recipient
  snapshot preview, idempotent group/survey enqueue, and safe delivery history.
  Booking proofs are fresh 256-bit bearer secrets returned once; PostgreSQL
  stores only SHA-256 digests with contact, purpose-derived scopes, expiry, and
  consume state. Idempotency replay never returns the raw proof. Message
  size/type is decided from normalized EUC-KR byte counts.
- A durable PostgreSQL-to-Google-Sheets-only projection for booking create,
  update, cancellation, and the first successful QR check-in, plus read-only
  ADMIN readiness, mapping, and delivery-audit endpoints. PostgreSQL remains the
  sole authority; Sheet edits are never imported. Workbook payloads and
  credentials are never returned, and production writes stay safely blocked
  until the deployment's credential, sharing, mapping, schema, idempotency, and
  QR-link gates pass.
- RFC 9457 application/problem+json errors and Idempotency-Key for every
  durable mutation. Scanner heartbeat and SMS target preview are explicitly
  ephemeral. Test fixtures and bypass routes are not public API.

## Local validation

No package installation, network access, generated files, or root lockfile
change is required. Python 3 and PyYAML are supplied by the project environment.

    npm run validate

or directly:

    python3 scripts/validate_openapi.py openapi.yaml

The validator rejects duplicate YAML keys, unresolved internal references,
missing/duplicate operation IDs, path-parameter mismatches, unknown security
schemes, missing CSRF on cookie-auth mutations, and missing idempotency on
durable mutations. It also enforces the core family-booking, OTP implementation,
student-resolution, sync-count, scanner-context, one-time-secret, and
append-only-history invariants. Session-scope coupling and authorization,
pairing claim/cancel race semantics, exact pairing-code format, unpair/revoke
hard-delete/preservation lifecycles, scanner list/presence filters, roster XLSX,
session count semantics, survey participant context, and scanner battery
telemetry are also checked. SMS route/status,
target-snapshot, safe-history, OTP response, and outbound-only Google Sheets
capability/readiness safety invariants are checked as well.

`npm run validate` also compares every NestJS business controller method with
the OpenAPI path/method inventory. `/health/live` and `/health/ready` are the
only explicit internal-route allowlist entries; every other controller route
must have exactly one contract operation and vice versa.
