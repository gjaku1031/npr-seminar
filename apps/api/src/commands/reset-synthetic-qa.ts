import { pathToFileURL } from "node:url";
import { createSyntheticQaPrisma, resetSyntheticQaDatabase } from "./synthetic-qa-database.js";
import { assertSyntheticQaSafety } from "./synthetic-qa-safety.js";

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("The synthetic QA reset accepts no arguments");
  const safety = assertSyntheticQaSafety(process.env, "reset");
  const prisma = createSyntheticQaPrisma(safety.databaseUrl);
  try {
    await resetSyntheticQaDatabase(prisma);
    process.stdout.write(`${JSON.stringify({ action: "RESET", database: safety.databaseName })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Synthetic QA reset failed"}\n`);
    process.exitCode = 1;
  });
}
