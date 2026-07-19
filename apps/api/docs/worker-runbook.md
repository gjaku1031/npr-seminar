# Isolated delivery worker

The HTTP API and delivery worker are separate trust boundaries. The API process imports only admin-read and transactional outbox providers. It must not receive `GOOGLE_APPLICATION_CREDENTIALS`; configuration validation refuses to start if it does.

The worker runs `dist/worker.js` with `PROCESS_ROLE=worker` under a dedicated OS account. It uses `WORKER_DATABASE_URL` for the restricted `npr_worker` database role. Do not give the worker `DATABASE_URL`, an HTTP listener, or interactive login access.

When Google Sheets delivery is enabled, the worker additionally requires `GOOGLE_SHEETS_SPREADSHEET_ID` and an absolute `GOOGLE_APPLICATION_CREDENTIALS` path. The credential must be a regular, non-symlink file owned by the worker UID with no group or other permission bits (for example mode `0600`). Keep `GOOGLE_SHEETS_ENABLED=false` until workbook sharing is restricted and the mapping is explicitly validated and closed.

Example systemd hardening directives:

```ini
[Service]
User=npr-seminar-worker
Group=npr-seminar-worker
Environment=PROCESS_ROLE=worker
EnvironmentFile=/etc/npr-seminar/worker.env
ExecStart=/usr/bin/node /opt/npr-seminar/apps/api/dist/worker.js
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/etc/npr-seminar/google-service-account.json
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
UMask=0077
```

Provision the `npr_app` and `npr_worker` LOGIN roles outside Prisma migrations. The baseline migration conditionally grants privileges when those roles already exist. `npr_worker` receives only the booking projection reads and SMS/Sheets outbox and attempt privileges required by the worker.
