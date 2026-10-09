// 시트 매핑 준비·활성화 운영 명령
// 사용: node dist/modules/google-sheets/sheet-mapping-control.command.js --mode=prepare|enable --mapping-id=<UUID v4> --confirm-spreadsheet-id=<스프레드시트 ID>
// 성공 시 결과 JSON을 표준 출력, 실패 시 오류 코드만 표준 오류로 출력하고 종료 코드 1
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "../../worker-app.module.js";
import {
  SheetMappingActivationError,
  SheetMappingActivationService,
  type SheetMappingActivationMode,
} from "./sheet-mapping-activation.service.js";

/**
 * `--{name}=값` 형식 명령 인자 값
 *
 * @returns 인자 값. 없으면 undefined
 */
function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

/**
 * 인자 검증 후 워커 컨텍스트에서 매핑 작업 실행
 *
 * @throws {SheetMappingActivationError} 인자 형식 오류·작업 실패
 */
async function main(): Promise<void> {
  const mode = argument("mode");
  const mappingId = argument("mapping-id");
  const confirmedSpreadsheetId = argument("confirm-spreadsheet-id");
  if ((mode !== "prepare" && mode !== "enable")
    || mappingId === undefined
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mappingId)
    || confirmedSpreadsheetId === undefined) {
    throw new SheetMappingActivationError("GOOGLE_SHEETS_CONTROL_ARGUMENTS_INVALID");
  }

  // 워커 모듈로 컨텍스트를 만들어 워커 DB 계정과 Google 자격 증명 사용
  const context = await NestFactory.createApplicationContext(WorkerAppModule, { logger: false });
  try {
    const result = await context.get(SheetMappingActivationService).execute({
      mode: mode as SheetMappingActivationMode,
      mappingId,
      confirmedSpreadsheetId,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

// 오류 상세는 출력하지 않고 코드만 남김
void main().catch((error: unknown) => {
  const code = error instanceof SheetMappingActivationError ? error.code : "GOOGLE_SHEETS_CONTROL_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
