// Compatibility barrel. Process-scoped modules keep provider credentials out of
// the HTTP dependency graph.
export { SmsAdminModule } from "./sms-admin.module.js";
export { SmsOutboxModule } from "./sms-outbox.module.js";
export { SmsWorkerModule } from "./sms-worker.module.js";
