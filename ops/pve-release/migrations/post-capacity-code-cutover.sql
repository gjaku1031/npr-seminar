-- DEFERRED CONTRACT PHASE ONLY.
-- Run through the migration role only after every API/worker instance is on
-- the capacity-ledger-free release and its health checks have passed. This
-- file is deliberately outside apps/api/prisma/migrations so migration-first
-- deployments cannot drop the table while old processes are still running.
set lock_timeout = '5s';

drop table if exists public.session_capacities;

reset lock_timeout;
