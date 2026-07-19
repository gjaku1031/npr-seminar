# NPR Seminar API

NestJS 11 / TypeScript backend for student synchronization, family bookings,
OTP verification, opaque QR credentials, scanner check-in, surveys, SMS outbox,
and one-way Google Sheets projection. PostgreSQL is the domain source of truth;
Redis contains only expiring sessions, rate-limit counters, pairing state, and
other non-authoritative ephemeral data.

The API contract is [`../../packages/contracts/openapi.yaml`](../../packages/contracts/openapi.yaml).

## Commands

Run commands from the repository root with pnpm:

```bash
pnpm --filter @npr-seminar/api typecheck
pnpm --filter @npr-seminar/api test
pnpm --filter @npr-seminar/api test:integration
pnpm --filter @npr-seminar/api build
```

Prisma Client is generated before build, lint, typecheck, and tests. Generated
files under `src/generated/prisma` are intentionally not tracked.

Apply migrations only with a migration-role URL:

```bash
MIGRATION_DATABASE_URL='postgresql://...' \
  pnpm --filter @npr-seminar/api migrate:deploy
```

Runtime uses `DATABASE_URL`; the worker uses `WORKER_DATABASE_URL` in
production. Do not use either runtime role to apply schema migrations.

## Processes

- API: `pnpm --filter @npr-seminar/api start:prod`
- Outbox worker: `pnpm --filter @npr-seminar/api start:worker`

The API process has no Google service-account credential path. The worker is
the only process allowed to read Google credentials or call Google Sheets and
SMS providers. See [`docs/worker-runbook.md`](docs/worker-runbook.md).

## Required production configuration

API configuration includes:

- `APP_ENV=production`, `PROCESS_ROLE=api`
- `DATABASE_URL`, `REDIS_URL`, `PUBLIC_BASE_URL`
- `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `PHONE_HMAC_KEY`, `OTP_PEPPER`
- `SCANNER_PAIRING_HMAC_KEY`
- `SMS_ENABLED=true` when public OTP issuance is enabled

TongTongTong synchronization stays network-disabled unless both
`TONG_SYNC_ENABLED=true` and `TONG_WIRE_CONTRACT_CONFIRMED=true` are set and
the HTTPS origin, credentials, and strict `TONG_WIRE_CONTRACT_JSON` are all
valid. Do not confirm that flag until the login, branch-switch, context marker,
grid paths, and exact `colModel` titles have been independently captured. A
failed or indeterminate login opens the durable circuit after one attempt;
there is no automatic login retry or reset.

Worker configuration includes:

- `APP_ENV=production`, `PROCESS_ROLE=worker`
- `WORKER_DATABASE_URL`, `PUBLIC_BASE_URL`, `PHONE_ENCRYPTION_KEY`
- provider-specific SMS variables and, when enabled, a locked-down
  `GOOGLE_APPLICATION_CREDENTIALS` file

Use [`.env.example`](.env.example) only as a key inventory. Never commit real
values.

## Security and data invariants

- Mother and father contacts are encrypted at rest and indexed only by keyed
  digest/last-four metadata. A booking stores the exact verified contact under
  generic `contact_*` columns.
- OTP and booking-management proofs are one-use for mutations. Raw proofs and
  QR tokens are returned only on fresh issuance and are absent from idempotency
  replay snapshots.
- Secret-bearing responses use `Cache-Control: private, no-store` and
  `Pragma: no-cache`.
- Family capacity changes, session moves, participant snapshots, QR state,
  events, SMS, and Sheets outboxes commit atomically.
- `family_booking_students_family_session_fk` is deferrable in SQL; a session
  move explicitly defers it inside the transaction before updating the parent
  and all participant rows.
- Google Sheets is outbound-only. Raw QR bearer tokens never enter URLs, SMS,
  Sheets, logs, or durable response snapshots.
- The Sheets v2 fingerprint describes only the exact `예약명단` projection:
  sheet ID `1777564107`, title `예약명단`, A:K headers, blank L:AC, and the
  protected AD marker. Unrelated tabs are allowed and are never value-read or
  written; a missing target or any title/ID ambiguity remains fail-closed.

See [`docs/sync-runbook.md`](docs/sync-runbook.md), [`docs/worker-runbook.md`](docs/worker-runbook.md),
and [`docs/erd.md`](docs/erd.md).

## Administrator bootstrap

After building, supply the password through a protected file descriptor. The
password is never accepted as a command-line value.

```bash
ADMIN_BOOTSTRAP_USERNAME=seminar-admin \
ADMIN_BOOTSTRAP_DISPLAY_NAME='Seminar Admin' \
ADMIN_BOOTSTRAP_PASSWORD_FD=3 \
pnpm --filter @npr-seminar/api db:seed 3</run/secrets/npr_admin_password
```

Add `-- --rotate` only for an intentional password rotation.
