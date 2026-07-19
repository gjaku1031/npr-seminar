import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { OfflineSnapshotService } from "../modules/student-sync/offline-snapshot.service.js";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string): string {
  const value = option(name);
  if (value === undefined || value.trim() === "") throw new Error(`Required option is missing: --${name}`);
  return value;
}

async function run(): Promise<void> {
  const mode = process.argv[2];
  const context = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const service = context.get(OfflineSnapshotService);
    const snapshotPath = required("snapshot-path");
    const actor = option("actor") ?? "offline-import-operator";
    const result = mode === "dry-run"
      ? await service.dryRun(snapshotPath, actor)
      : mode === "publish"
        ? await service.publish(snapshotPath, required("run-id"), required("confirmation"), actor)
        : (() => { throw new Error("Mode must be dry-run or publish"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

void run();
