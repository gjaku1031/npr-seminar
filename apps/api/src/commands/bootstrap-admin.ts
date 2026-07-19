import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { argon2id, hash } from "argon2";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EnvironmentModule } from "../common/config/environment.module.js";
import { PrismaModule } from "../common/prisma/prisma.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

interface BootstrapAdminInput {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly rotate: boolean;
}

export interface BootstrapAdminResult {
  readonly action: "CREATED" | "UNCHANGED" | "ROTATED";
  readonly adminUserId: string;
}

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
})
class BootstrapAdminModule {}

export async function bootstrapAdmin(prisma: PrismaService, input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
  const username = input.username.normalize("NFKC").trim().toLowerCase();
  const displayName = input.displayName.normalize("NFKC").trim();
  validateIdentity(username, displayName);
  validatePassword(input.password, username);
  const passwordHash = await hash(input.password, {
    type: argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended('npr:bootstrap-admin',0))`;
    const existing = await transaction.adminUser.findUnique({ where: { username } });
    if (existing !== null && !input.rotate) {
      return { action: "UNCHANGED", adminUserId: existing.publicId };
    }
    if (existing === null) {
      const created = await transaction.adminUser.create({ data: {
        username, displayName, passwordHash, role: "ADMIN", active: true,
      } });
      await transaction.authAudit.create({ data: {
        adminUserId: created.id, actorSubject: created.publicId,
        eventType: "ADMIN_BOOTSTRAP", resultCode: "CREATED", safeMetadata: {},
      } });
      return { action: "CREATED", adminUserId: created.publicId };
    }
    const rotated = await transaction.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash, displayName, role: "ADMIN", active: true },
    });
    await transaction.authAudit.create({ data: {
      adminUserId: rotated.id, actorSubject: rotated.publicId,
      eventType: "ADMIN_BOOTSTRAP", resultCode: "PASSWORD_ROTATED", safeMetadata: {},
    } });
    return { action: "ROTATED", adminUserId: rotated.publicId };
  });
}

function validateIdentity(username: string, displayName: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(username)) throw new Error("ADMIN_BOOTSTRAP_USERNAME is invalid");
  if (displayName.length < 1 || displayName.length > 120) throw new Error("ADMIN_BOOTSTRAP_DISPLAY_NAME is invalid");
}

function validatePassword(password: string, username: string): void {
  const strong = password.length >= 14 && password.length <= 512
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  if (!strong || password.toLowerCase().includes(username)) throw new Error("The bootstrap password does not meet policy");
}

function passwordFromEnvironment(): string {
  const direct = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const descriptorText = process.env.ADMIN_BOOTSTRAP_PASSWORD_FD;
  if ((direct === undefined) === (descriptorText === undefined)) {
    throw new Error("Provide exactly one bootstrap password source");
  }
  if (direct !== undefined) return direct;
  if (!/^(?:0|[1-9]\d{0,3})$/.test(descriptorText!)) throw new Error("ADMIN_BOOTSTRAP_PASSWORD_FD is invalid");
  const descriptor = Number(descriptorText);
  const secret = readFileSync(descriptor);
  try {
    return secret.toString("utf8").replace(/\r?\n$/, "");
  } finally {
    secret.fill(0);
  }
}

async function main(): Promise<void> {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--rotate");
  if (unknownArguments.length > 0) throw new Error("Only --rotate is accepted");
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? "";
  const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "";
  const password = passwordFromEnvironment();
  const context = await NestFactory.createApplicationContext(BootstrapAdminModule, { logger: false });
  try {
    const result = await bootstrapAdmin(context.get(PrismaService), {
      username, displayName, password, rotate: process.argv.includes("--rotate"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Administrator bootstrap failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
