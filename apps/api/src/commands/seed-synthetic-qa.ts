import { pathToFileURL } from "node:url";
import { createSyntheticQaPrisma, seedSyntheticQaDatabase } from "./synthetic-qa-database.js";
import { assertSyntheticQaSafety } from "./synthetic-qa-safety.js";

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

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Synthetic QA seed failed"}\n`);
    process.exitCode = 1;
  });
}
