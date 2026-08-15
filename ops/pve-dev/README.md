# pve-dev isolated QA stack

This stack is intentionally independent from `pve-release`.

- PostgreSQL 18: `127.0.0.1:55432`, database `npr_seminar_qa`
- Redis 8: `127.0.0.1:56379`, ACL namespace `npr:staging:*`
- Nest API: `127.0.0.1:4100`
- Next.js web: `127.0.0.1:3100`
- systemd front door: `127.0.0.1:3000`
- Internet-public Tailscale Funnel URL: `https://pve-dev.tailedbbb5.ts.net`

Secrets are generated once in `/etc/npr-seminar-qa` with mode `0600`. Never
copy `.env.example` into service use and never reuse release credentials.
The deploy creates exactly one active tester account, `admin` / `admin`, as
requested for this synthetic QA environment. Every deploy re-hashes the fixed
value and deactivates older QA bootstrap accounts. This exception is guarded by
`APP_ENV=staging` inside the bootstrap command and is never enabled by the
release deployment.
TongTongTong remains disabled. The base install keeps SMS and Google Sheets
delivery disabled until the dedicated integration activation step has verified
the isolated QA credentials and workbook. `activate-qa-integrations.sh` validates
both API and worker overrides, enables actual SMS and all six QA Sheet mappings,
restarts both processes, and confirms their effective environment without
touching release resources. Once integration override files exist, every smoke
test also requires real-SMS mode and six enabled schema-v4 QA mappings, and a
normal deploy automatically re-prepares those mappings against the newly built
Sheet schema before declaring the deployment healthy.
The deploy script publishes only the loopback front door through Tailscale
Funnel; the PostgreSQL, Redis, Nest and Next listener ports stay loopback-only.
Normal deploys retain the existing QA database. The deterministic seed runs
automatically only for an empty database, so incremental frontend and API
deploys never erase tester activity.

```bash
sudo ops/pve-dev/install-datastores.sh
sudo ops/pve-dev/deploy-qa.sh
sudo ops/pve-dev/activate-qa-integrations.sh
sudo ops/pve-dev/smoke-qa.sh
```

To deliberately rebuild and reseed the isolated QA database, use both guards:

```bash
sudo env QA_FORCE_RESEED=true \
  QA_DATA_CONFIRMATION='SEED NPR SYNTHETIC QA' \
  ops/pve-dev/deploy-qa.sh
```

Forced reseeding intentionally removes runtime reservations, outboxes, and
Sheet mappings. Run `activate-qa-integrations.sh` again afterward. Direct
`db:seed:qa` and `db:reset:qa` commands retain their independent staging, DB
name, and exact-confirmation guards for focused data maintenance.

To leave an empty QA domain while retaining branches and default templates,
replace the confirmation with `RESET NPR SYNTHETIC QA` and run `db:reset:qa`.
Named volumes are retained by normal `docker compose down`; deleting them is a
separate destructive operation and is deliberately not automated here.
