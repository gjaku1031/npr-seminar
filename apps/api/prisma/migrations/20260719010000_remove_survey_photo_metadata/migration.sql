-- Keep the legacy nullable columns for one release so an automatic code
-- rollback can still start the previous binary after the forward migration.
-- The current Prisma schema and HTTP contract no longer read or write them;
-- a later, separately scheduled cleanup migration may remove them after the
-- rollback window has closed.
SELECT 1;
