// 합성 QA 데이터 적재 명령. 인자 없이 실행하며 안전 조건(assertSyntheticQaSafety)을 모두 만족해야 함
// 결과 JSON 출력, 실패 시 종료 코드 1
import { pathToFileURL } from "node:url";
import { createSyntheticQaPrisma, seedSyntheticQaDatabase } from "./synthetic-qa-database.js";
import { assertSyntheticQaSafety } from "./synthetic-qa-safety.js";

/**
 * 안전 조건 확인 후 QA 데이터 적재
 *
 * @throws {Error} 인자 있음, 안전 조건 위반
 */
async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("The synthetic QA seed accepts no arguments");
  const safety = assertSyntheticQaSafety(process.env, "seed");
  const prisma = createSyntheticQaPrisma(safety.databaseUrl);
  try {
    const result = await seedSyntheticQaDatabase(prisma, process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행할 때만 main 호출
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Synthetic QA seed failed"}\n`);
    process.exitCode = 1;
  });
}
