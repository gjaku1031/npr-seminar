// 초기 학생 스냅샷 사전 점검·반영 명령
// 사용: node dist/commands/offline-snapshot.js dry-run --snapshot-path=<디렉터리> [--actor=<이름>]
//       node dist/commands/offline-snapshot.js publish --snapshot-path=<디렉터리> --run-id=<실행 ID> --confirmation="PUBLISH INITIAL SNAPSHOT <실행 ID>"
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { OfflineSnapshotService } from "../modules/student-sync/offline-snapshot.service.js";

/**
 * `--{name}=값` 형식 명령 인자 값
 *
 * @returns 인자 값. 없으면 undefined
 */
function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

/**
 * 필수 명령 인자 값
 *
 * @throws {Error} 없거나 비어 있음
 */
function required(name: string): string {
  const value = option(name);
  if (value === undefined || value.trim() === "") throw new Error(`Required option is missing: --${name}`);
  return value;
}

/**
 * 모드에 따라 사전 점검 또는 반영 실행 후 결과 JSON 출력
 */
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
