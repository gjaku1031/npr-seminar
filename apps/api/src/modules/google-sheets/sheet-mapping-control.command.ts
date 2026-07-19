import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "../../worker-app.module.js";
import {
  SheetMappingActivationError,
  SheetMappingActivationService,
  type SheetMappingActivationMode,
} from "./sheet-mapping-activation.service.js";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

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

void main().catch((error: unknown) => {
  const code = error instanceof SheetMappingActivationError ? error.code : "GOOGLE_SHEETS_CONTROL_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
