# pve-release operations

This directory is the reproducible configuration for the NPR release VM. It
contains no passwords, cookies, or source student payloads.

## 정적 export 전환과 기존 배포 절차

아래 `deploy-nest-release.sh`는 Next 서버가 `127.0.0.1:3000`에서 실행되고
Caddy upstream이 그 서버로 이어지는 기존 운영 구조를 전제로 한다. 정적 export의
`apps/web/out`을 S3에 업로드하거나 CloudFront의 `/api/v1/*` 원본을 구성하지 않는다.
정적 전환 브랜치의 웹 시작 명령은 이 스크립트가 기대하는 Next 서버가 아니므로,
기존 운영 VM에 이 스크립트를 그대로 적용하지 않는다. 별도 API 인입 경로와
CloudFront/S3 전환이 검증되기 전까지 기존 운영 배포는 현재 구조로 유지한다.
정적 배포 계약과 로컬 미리보기는 [static-web 안내](../static-web/README.md)를 따른다.

## Target layout

- PostgreSQL 18 data: `/srv/postgresql/18/main`
- Redis data: `/srv/redis`
- API releases and build tools: `/srv/npr-seminar`
- PostgreSQL backups: `/srv/backups/postgresql`
- Runtime secrets: `/etc/npr-seminar/runtime.env`
- TongTongTong secrets: `/etc/npr-seminar/secrets`
- TongTongTong session and snapshots: `/var/lib/npr-seminar/tongtong`
- Active and immutable poster assets: `/var/lib/npr-seminar/poster`

PostgreSQL and Redis listen only on loopback. The `npr_app` database role is
the HTTP API role. `npr_worker` can claim the SMS/Sheets outboxes, write their
attempt ledgers, and read only the booking, student, event, and session rows
needed to derive the current Sheet projection. `npr_migrator` owns the schema,
and `npr_readonly` is a read-only operational role. Redis disables the default
user and limits the application user to the `npr:*` keyspace, connection
lifecycle commands, and the exact data commands used by the API and session
store: `GET`, `SET`, `DEL`, `EXISTS`, `INCR`, `EXPIRE`, `TTL`, `SADD`,
`SMEMBERS`, and `EVAL`. Lua scripts remain confined to declared `npr:*` keys.

PostgreSQL server, database, and application-role sessions use UTC. This is a
storage and driver boundary: PrismaPg sends JavaScript Date values as UTC clock
components without an offset, so a non-UTC database session can shift a
`timestamptz` write. Browser views and Google Sheets continue to format instants
in `Asia/Seoul` explicitly; changing database session timezone does not change
that presentation policy.

## Provisioning

Take a hypervisor snapshot before changing the datastore configuration. Stage
the files in this directory on `pve-release`, then run
`install-datastores.sh` as root with the staging directory as its only
argument. The installer is host- and Ubuntu-release-gated and is idempotent for
the generated runtime credentials.

The VM also needs the repository's supported Node.js 22 runtime. The release
script installs its own integrity-pinned Corepack and uses the pinned pnpm
workspace; Java and Gradle are not part of the NestJS backend runtime.

### Existing Asia/Seoul VM UTC cutover

Apply the datastore configuration before deploying a release that contains the
UTC preflight. The preflight is intentionally fail-closed and will reject an
existing `Asia/Seoul` application session; it does not alter infrastructure.
Stop the database-writing services first so an old pool cannot reconnect with
its prior role setting between PostgreSQL startup and the role `ALTER`s:

```bash
sudo systemctl stop npr-seminar-api.service npr-seminar-worker.service
sudo ops/pve-release/install-datastores.sh /path/to/staged/datastore-files
sudo systemctl start npr-seminar-api.service npr-seminar-worker.service
sudo ops/pve-release/deploy-nest-release.sh deploy \
  --source /path/to/npr-seminar \
  --stamp "$(date -u +%Y%m%dT%H%M%SZ)"
```

Take the documented hypervisor snapshot first and plan a short API/worker
outage. The idempotent installer restarts the datastores, applies UTC to the
server, `npr_seminar` database, and all four database roles, and verifies new
connections before the writers are restarted. It does not rewrite application
rows. If the installer fails, leave the writers stopped and resolve the
datastore failure rather than bypassing the deploy preflight.

## NestJS/Next.js release deployment

`deploy-nest-release.sh` is the only supported application release entrypoint.
It is host-gated to `pve-release` and must run as root from a trusted, clean
source tree. It creates separate non-login users for the API, web, delivery
worker, build, and migration processes. Runtime processes can read the active
release but cannot modify it; only the Next cache is writable by `npr-web`.

The target layout is:

```text
/srv/npr-seminar/releases/<UTC stamp>  immutable source, dependencies, builds
/srv/npr-seminar/current               atomic symlink to the active release
/srv/npr-seminar/previous              atomic symlink to the prior release
/etc/npr-seminar/api.env               API-only environment, root:root 0600
/etc/npr-seminar/worker.env            worker-only environment, root:root 0600
/etc/npr-seminar/web.env               non-secret Next environment, root:root 0600
/etc/npr-seminar/migration.env         migrator URL only, root:root 0600
```

The first deployment safely upgrades the legacy `runtime.env` in place. It
keeps existing DB, Redis, and application secrets, adds missing Nest URLs and
cryptographic keys atomically, writes a root-only timestamped backup only when
content changes, and then derives the four process-specific files. It also
creates the previously absent `npr_worker` PostgreSQL role with a generated
password, without displaying it, before the migration. After migration it
revokes broad access and grants only the SMS/Sheets outbox, attempt ledger,
booking projection, and required sequence privileges.

The API-only `QR_ENCRYPTION_KEY` is a canonical base64-encoded 32-byte key.
The deploy wrapper generates it once for legacy runtime files, validates that
it is present only in `api.env`, and refuses activation while an active booking
still has an unrecoverable legacy QR credential.

The HTTP API environment is rejected if it contains
`GOOGLE_APPLICATION_CREDENTIALS`, `WORKER_DATABASE_URL`, or
`MIGRATION_DATABASE_URL`.

The API receives only the shared `SMS_ENABLED`, allowlist-enabled,
`SMS_TEST_RECIPIENTS`, and test-mode state needed to fail closed and report
readiness. The recipient list is required because OTP creation checks the
allowlist before enqueueing. Aligo credentials, sender numbers, and Google
credentials remain worker-only.

A Google service-account file belongs only to the worker and, when enabled,
must be installed as follows:

```bash
sudo install -o npr-worker -g npr-worker -m 0600 \
  google-service-account.json /etc/npr-seminar/google-service-account.json
```

Add only the non-secret path
`GOOGLE_APPLICATION_CREDENTIALS=/etc/npr-seminar/google-service-account.json`
to root-owned `/etc/npr-seminar/runtime.env`, keep
`GOOGLE_SHEETS_ENABLED=false`, and run a normal deployment so the path is
copied into the worker-only environment. Never place the JSON body in an env
file or command argument.

Keep `GOOGLE_SHEETS_ENABLED=false` until the workbook is restricted, shared
with that service account, and its protected marker columns are approved.
Keep SMS disabled or recipient-allowlisted until the production sender values
have been verified.

Google Sheets marker preparation and mapping enablement use the fail-closed
control wrapper. It requires the worker to be stopped, verifies the exact
configured spreadsheet ID and the worker-owned 0600 credential, and runs the
isolated command through a transient systemd service without printing secret
environment values:

```bash
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-control.sh \
  prepare MAPPING_UUID CONFIRMED_SPREADSHEET_ID
```

The wrapper records the worker's initial state. If it was active, the wrapper
stops it for exclusive mapping control and restores it on both success and
failure. If it was already inactive, it stays inactive so maintenance state is
not overridden. It shares the application deployment lock, so prepare/enable
cannot overlap a deployment, reset, or web activation. A failed prepare/enable
leaves the mapping `BLOCKED`.

Do not use `enable` until test-copy E2E, workbook permission restriction, and
production approval are complete. `enable` additionally requires
`GOOGLE_SHEETS_ENABLED=true` in the deployed worker environment and performs a
fresh read-only validation before closing the mapping circuit.

After either command, explicitly restore and verify the worker when it was
intentionally stopped before the wrapper:

```bash
sudo systemctl start npr-seminar-worker.service
sudo systemctl is-active npr-seminar-worker.service
sudo systemctl --no-pager --lines=50 status npr-seminar-worker.service
```

Then inspect the authenticated
`GET /api/v1/admin/sheets/readiness` response. `prepare` must remain
`liveWritesSupported=false` with `GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED`.
Approved `enable` must report `liveWritesSupported=true` after the worker's
fresh validation. Do not treat service `active` alone as Sheets readiness.

### Development booking and Sheets v4 reset

The current deployment is explicitly a development environment. When a schema
change requires every legacy booking/QR to be removed, use the host-gated reset
instead of ad-hoc SQL. `preflight` is read-only and reports counts only:

Do not begin the destructive maintenance window while the approved workbook
still has an `anyone`, domain, or group permission. Sharing changes are an
owner action outside these scripts. Obtain that explicit change first; the
deployed v4 client will independently re-check it during `prepare`, `enable`,
every delivery, and final web activation.

For the migration that introduces recoverable QR ciphertext, use the reset
script from the **staged new source tree**, not an older active release. The
strict handoff keeps API, worker, and web stopped after the committed reset so
no legacy code can recreate an unrecoverable QR between reset and migration:

```bash
sudo /path/to/staged/npr-seminar/ops/pve-release/reset-development-bookings.sh preflight
sudo /path/to/staged/npr-seminar/ops/pve-release/reset-development-bookings.sh \
  execute 'RESET ALL NPR DEVELOPMENT BOOKINGS' --leave-services-stopped
sudo systemctl is-active npr-seminar-api.service npr-seminar-worker.service \
  npr-seminar-web.service  # all three must report inactive
```

`execute` takes the deployment lock, stops the API and worker, creates a
PostgreSQL backup, clears only booking/check-in/QR/booking-delivery data,
closes every existing non-enrolled booking
toggle, and verifies zero remaining active QR credentials. Without the option
it restores the prior service states. `--leave-services-stopped` additionally
stops web and restores prior states only on failure; after success all three
stay stopped for `deploy --defer-web`. Students, seminars/sessions, scanners, administrators, and
Sheet mapping configuration are preserved. The command works before or after
the booking-access migration so the legacy active-QR ciphertext preflight is
never bypassed. If the SQL transaction commits but post-reset verification
cannot prove the expected zero state, services remain stopped regardless of
the option; restore or investigate before any restart.

### Capacity-ledger contract phase

The runtime release that removes capacity/counter access must be deployed and
healthy before the obsolete table is dropped. The destructive SQL has one
canonical source at
`ops/pve-release/migrations/post-capacity-code-cutover.sql`; it is deliberately
outside the automatic Prisma migration chain because this deploy script runs
migrations before switching away from old processes.

In a later CI contract phase, after verifying every API and worker instance is
on the ledger-free release, execute the file with the migration-role URL:

```bash
psql "$MIGRATION_DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --file=ops/pve-release/migrations/post-capacity-code-cutover.sql
```

Do not run it while rollback to a capacity-ledger runtime remains possible.

After the DB/API release and worker are healthy, prepare the v4 workbook before
enabling it. Preparation creates `예약집계`, initializes the blank `로그` header,
and protects the three technical marker columns. Then clear the approved
development workbook's data rows while preserving row 1 and formatting:

```bash
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-control.sh \
  prepare MAPPING_UUID EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-reset-development-data.sh preflight
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-reset-development-data.sh \
  execute 'CLEAR NPR DEVELOPMENT SHEETS EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

The Sheets reset re-reads sharing, locale/timezone, exact tab IDs/widths,
headers, and marker protections immediately before the write. It clears only
`예약명단!A2:AD`, `예약집계!A2:Z`, and `로그!A2:Z`, then verifies all three data
regions are empty and every header is unchanged. It refuses an unprepared v4
workbook. Both `prepare` and the reset check Drive sharing before their first
Sheet write. Any `anyone`, domain, or group permission—including link-reader
access—blocks the operation because reservation rows contain full parent phone
numbers. Never weaken this gate or change live sharing as part of deployment;
an owner must explicitly remove unsafe sharing first. The reset additionally
requires the database mapping to be v4, disabled, `BLOCKED`, and freshly
validated by `prepare`; it refuses to clear an already-enabled workbook.

For an ordinary release, keep the existing one-command behavior. For this
Sheets v4 transition, use the strict two-stage mode so the public web cannot be
started before the workbook is private and validated:

```bash
sudo ops/pve-release/deploy-nest-release.sh deploy \
  --source /path/to/npr-seminar \
  --stamp "$(date -u +%Y%m%dT%H%M%SZ)" \
  --defer-web

# API and worker are healthy; web and port 3000 remain stopped. The workbook
# owner must now remove every anyone/domain/group permission. The following
# commands fail closed until that explicit privacy change is complete.
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-control.sh \
  prepare MAPPING_UUID EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-reset-development-data.sh preflight
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-reset-development-data.sh \
  execute 'CLEAR NPR DEVELOPMENT SHEETS EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx'
sudo /srv/npr-seminar/current/ops/pve-release/google-sheets-control.sh \
  enable MAPPING_UUID EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx

sudo /srv/npr-seminar/current/ops/pve-release/deploy-nest-release.sh activate-web
```

Set `GOOGLE_SHEETS_ENABLED=true` in the approved runtime configuration before
the deferred deploy. The v4 migration still forces every mapping to
`BLOCKED`, so the worker cannot dispatch before explicit `enable`.
`activate-web` requires the exact deferred release marker, healthy API/worker
loopback boundaries, and at least one mapping; it freshly re-runs `enable` for
every mapping through the deployed client. Thus a newly public/shared workbook
fails closed before web starts. It then verifies local web readiness, the
Caddy-only upstream socket, and public HTTPS before removing the marker. If
Sheets or web validation fails, web and its upstream socket stay stopped and
the marker is retained for retry. A failed deferred API/worker activation
restores the old code link but deliberately leaves every application service
stopped; it never starts legacy code after the forward migration. Do not use
`rollback` during this QR transition unless the target has been independently
verified to write encrypted QR credentials. The enforced operational order is
development DB reset, DB/API, worker, private Sheets v4 prepare/clear/enable,
web.

Interruption is fail-closed. If the deferred marker is absent, or does not
match `readlink -f /srv/npr-seminar/current`, do not start web. If any service
was manually restarted after the reset, or reset preflight reports a new
booking/active QR, stop all three services and repeat the reset before retrying
the migration. If a marker exists after an interrupted deploy, verify the exact
current release and API/worker health before continuing; never delete the marker
merely to bypass an activation check.

The host's bundled Corepack is not trusted for the build. Node 22.22.1 and the
old Corepack 0.24 combination fails before pnpm starts. The deployment script
downloads only `corepack@0.34.7` from the npm registry, verifies its pinned
SHA-512 integrity, installs it under `/srv/npr-seminar/.tooling`, and then
requires the workspace-pinned `pnpm@11.10.0` exactly. It never selects the
latest pnpm release or replaces the host-wide Corepack binary.

Run a normal deployment from a staged checkout:

```bash
sudo ops/pve-release/deploy-nest-release.sh deploy \
  --source /path/to/npr-seminar \
  --stamp "$(date -u +%Y%m%dT%H%M%SZ)"
```

The script performs these gates before reporting success:

1. source, Node 22, pinned Corepack/pnpm, systemd unit, and environment checks;
2. frozen dependency install plus Nest and Next production builds;
3. presence of API, worker, Prisma, and Next artifacts, including the compiled
   same-origin rewrite from `/api/v1/*` to `http://127.0.0.1:4000`;
4. authenticated Redis `PING` plus an ephemeral `EVAL`/`SET`/`GET`/`DEL` ACL
   probe using the private `REDIS_URL` (the credential is never placed in a
   command-line argument or printed);
5. an authenticated PostgreSQL preflight requiring the effective session
   `TimeZone` to be exactly `UTC`;
6. a PostgreSQL backup, forward-only Prisma migration, and exact worker grants;
7. atomic `current` switch and separate systemd startup for API, worker, web;
8. API readiness, Next root, same-origin API rewrite, exact loopback and
   Caddy-only listener boundaries, and public-domain HTTPS checks.

`audit-timestamptz-offset.sql` is a read-only inventory and candidate report
for rows written before the UTC correction. Its exact-minus-nine-hour flags are
evidence for review, not permission to mass-update rows. A correction is safe
only when an affected value has an independent database-generated timestamp in
the same transaction, or another deterministic domain interval. Schedule times
and other user-supplied instants require comparison with their original source.

`--skip-migrations` exists only for an explicitly verified schema-compatible
code release. It still creates a backup and reconciles the worker role. Do not
use it for the initial Nest deployment.

If any post-switch check fails, the script restores the old `current` link and
restarts the prior code. Database migrations are intentionally not reversed;
every production migration must therefore remain backward compatible with the
previous code release. A manual code rollback is:

```bash
# Roll back to /srv/npr-seminar/previous
sudo ops/pve-release/deploy-nest-release.sh rollback

# Or select an exact retained release
sudo ops/pve-release/deploy-nest-release.sh rollback 20260717T120000Z
```

Inspect the application and ingress trust boundaries independently:

```bash
sudo systemctl status npr-seminar-api.service --no-pager
sudo systemctl status npr-seminar-web.service --no-pager
sudo systemctl status npr-seminar-worker.service --no-pager
sudo systemctl status npr-seminar-caddy-upstream.socket \
  npr-seminar-caddy-upstream.service --no-pager
sudo journalctl -u npr-seminar-api.service -u npr-seminar-web.service \
  -u npr-seminar-worker.service -u npr-seminar-caddy-upstream.socket \
  -u npr-seminar-caddy-upstream.service --since -15m --no-pager
sudo ss -H -ltn '( sport = :3000 or sport = :3001 or sport = :4000 or sport = :5432 or sport = :6379 )'
```

## First administrator

After the first successful application deployment, create the administrator
with the host-gated helper. It generates a high-entropy password, passes it to
the Nest command only through a protected file descriptor, and writes the
credential once to a timestamped `root:root` mode-0600 file under `/root`.

```bash
sudo ops/pve-release/bootstrap-admin.sh
```

Retrieve that file over SSH, verify the first login, and securely remove it.
The helper refuses to change an existing administrator unless `--rotate` is
explicitly supplied.

## Public HTTPS exposure through GCP Caddy and WireGuard

The Caddy service on the GCP VM at public IP `203.0.113.10` is the only
application ingress and TLS terminator for `https://survey.example.kr`.
Traffic reaches `pve-release` through the dedicated WireGuard /30
(`10.99.0.1` on GCP and `10.99.0.2` on `pve-release`). On `pve-release`, Next
remains bound to `127.0.0.1:3000`, Nest to `127.0.0.1:4000`, PostgreSQL to
`127.0.0.1:5432`, and Redis to `127.0.0.1:6379`. None of those application or
datastore ports may gain a LAN, wildcard, router port-forward, or public
listener.

The deployment installs and enables
`npr-seminar-caddy-upstream.socket` and
`npr-seminar-caddy-upstream.service`. The socket is the single deliberate
non-loopback listener: it binds exactly to `10.10.10.165:3001`, and
`systemd-socket-proxyd` forwards accepted connections to the loopback-only
Next listener at `127.0.0.1:3000`. GCP Caddy uses
`http://10.10.10.165:3001` as its WireGuard-routed upstream. Restrict access to
port 3001 to the `10.99.0.1` WireGuard peer at the host firewall; never point
Caddy at port 3000 or expose ports 4000, 5432, or 6379. The application path
does not use a router port-forward or any secondary public-ingress mechanism.

Every normal deploy and rollback starts the local web service and the socket
proxy, then requires exactly these listeners:

```text
10.10.10.165:3001  WireGuard-only Caddy upstream socket
127.0.0.1:3000     Next
127.0.0.1:4000     Nest
127.0.0.1:5432     PostgreSQL
127.0.0.1:6379     Redis
```

IPv6 loopback is also accepted for the four loopback-only ports, but wildcard
or other addresses fail deployment. The deployment requires
`PUBLIC_BASE_URL` in the durable runtime, API, and worker environments to equal
`https://survey.example.kr` exactly (no alternate host or trailing slash),
then verifies both `/` and a public API request through that HTTPS origin.
Failure is a deployment blocker, not a reason to widen a listener.
Before the first deployment on this ingress path, replace any legacy
`PUBLIC_BASE_URL` value in `/etc/npr-seminar/runtime.env`; reconciliation
preserves an existing value and intentionally rejects it instead of silently
rewriting operator-owned durable configuration.

`deploy --defer-web` keeps both port 3000 and port 3001 closed until
`activate-web` succeeds. The public application URL is:

```text
https://survey.example.kr/
```

## TongTongTong safety contract

Application deployment copies the existing root-owned
`/etc/npr-seminar/secrets/tongtong-username` and `tongtong-password` values
only into the root-owned API environment. The worker, web, and migration
environments reject every `TONG_*` key. A first install defaults both live sync
and wire confirmation to disabled. The host-gated control command changes both
flags together in `runtime.env` and `api.env`; once explicitly enabled, that
state survives later deploys and rollbacks. The control command and deployment
itself make no upstream request.

For first activation, independently verify upstream recovery, reset the durable
database circuit through the authenticated ADMIN endpoint while live sync is
still disabled, and avoid doing this at a six-hour boundary. Then enable,
submit exactly one manual sync, and poll that returned run to a terminal state:

```bash
sudo /srv/npr-seminar/current/ops/pve-release/tong-sync-control.sh enable
# Submit one POST /api/v1/admin/student-sync/runs/manual, then poll its runId.
```

After a successful full three-branch run, leave the explicit enablement in
place: the API schedules the same zero-retry orchestrator at 00:00, 06:00,
12:00, and 18:00 Asia/Seoul. After a failure or indeterminate result, do not
issue a second manual request; disable live sync and leave the durable circuit
open until the upstream failure counter has been independently checked and an
operator performs the documented reset.

`tongtong-login-once.sh` performs one credential security check, never retries
it, and opens a local circuit on every rejected or ambiguous result. An
operator must reset the upstream failure count and explicitly return the local
circuit to `READY` before another run. Response bodies, cookies, credentials,
and student records must never be written to logs.

After a verified session exists, `tongtong-capture-snapshot.sh` reuses it and
switches A, B, C sequentially. It derives each branch's field mapping
from the page `colModel`; fixed `mN` positions are not a valid source contract.
The capture resolves `부모HP(모)` and optional `부모HP(부)` by title on every
branch and preserves them as `motherPhone` and `fatherPhone` respectively.
Snapshots are valid only when every file listed in `SHA256SUMS` verifies.

For the 2026-07-17 initial load, the approved immutable snapshot is:

```text
/var/lib/npr-seminar/tongtong/snapshots/20260717-143745
```

The importer must first dry-run this exact directory and publish the exact
validated run. It keeps only active students. A class name is accepted when it
is bracketless or ends in exactly one approved timetable suffix: one to three
distinct weekday characters with an optional positive slot 1..99 (no leading
zero), or `E`/`e` with that slot. It rejects asterisks, repeated weekdays,
zero/leading-zero slots, other Latin prefixes, management suffixes, and every
other bracket shape. Accepted suffixes and source keys are preserved, while
classification and same-base de-duplication use the suffix-stripped base. The
importer preserves every accepted assignment instead of collapsing multi-class
students. The migration applies a 5-second lock timeout and a 120-second
statement timeout while replacing and validating the assignment constraint; a
timeout is a failed deployment and must not be bypassed by disabling checks.
The initial-snapshot dry-run is only for an empty database. Once production is
populated, repeat reconciliation on a disposable fresh database or protected
restore clone; the production endpoint correctly returns HTTP 409 and must not
be forced past that guard.

## Backups

`npr-postgres-backup.timer` runs nightly at 03:30 Asia/Seoul. A backup consists
of a custom-format database dump, compressed globals, and matching SHA-256
manifest. Run an on-demand backup after the initial load:

```bash
sudo systemctl start npr-postgres-backup.service
sudo systemctl status npr-postgres-backup.service --no-pager
```

Restore tests must be performed into a separate database. Never restore over
the live database as a validation step.
