// Compatibility barrel. New code must import one of the process-scoped modules
// so that the HTTP API cannot instantiate the Google credential client.
export { GoogleSheetsAdminModule } from "./google-sheets-admin.module.js";
export { GoogleSheetsOutboxModule } from "./google-sheets-outbox.module.js";
export { GoogleSheetsWorkerModule } from "./google-sheets-worker.module.js";
