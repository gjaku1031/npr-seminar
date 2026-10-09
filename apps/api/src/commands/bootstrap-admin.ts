// 관리자 계정 생성·비밀번호 교체 명령
// 사용: ADMIN_BOOTSTRAP_USERNAME·ADMIN_BOOTSTRAP_DISPLAY_NAME과 비밀번호(ADMIN_BOOTSTRAP_PASSWORD 또는 _FD 중 하나)를 주고
//       node dist/commands/bootstrap-admin.js [--rotate]
// 결과 JSON을 표준 출력, 실패 시 메시지를 표준 오류로 출력하고 종료 코드 1
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

/**
 * 관리자 계정 준비 입력
 */
interface BootstrapAdminInput {
  /**
   * 로그인 ID. NFKC·공백 제거·소문자로 정규화
   */
  readonly username: string;

  /**
   * 표시 이름
   */
  readonly displayName: string;

  /**
   * 비밀번호 원문. argon2id 해시만 저장
   */
  readonly password: string;

  /**
   * 기존 계정이면 비밀번호를 교체할지 여부. false면 변경 없음
   */
  readonly rotate: boolean;

  /**
   * 격리된 합성 QA 전용 약한 자격 증명 허용 여부
   *
   * APP_ENV=staging에서 `admin`/`admin` 조합에만 적용. 그 외 호출자와 자격 증명은 운영 비밀번호 정책 그대로
   */
  readonly allowInsecureQaCredential?: boolean;
}

/**
 * 관리자 계정 준비 결과
 */
export interface BootstrapAdminResult {
  /**
   * 처리 결과. 생성·변경 없음·비밀번호 교체
   */
  readonly action: "CREATED" | "UNCHANGED" | "ROTATED";

  /**
   * 관리자 공개 ID
   */
  readonly adminUserId: string;
}

/**
 * 명령 전용 최소 모듈. 환경 설정과 DB만 구성
 */
@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
})
class BootstrapAdminModule {}

/**
 * 관리자 계정 생성 또는 비밀번호 교체
 *
 * 입력 검증과 argon2id 해시(64 MiB, 3회) 후 advisory lock 아래 계정 조회
 * 없으면 생성, 있으면 rotate일 때만 비밀번호·표시 이름 교체와 활성화. 감사 기록 포함
 *
 * @throws {Error} ID·표시 이름·비밀번호 정책 위반
 */
export async function bootstrapAdmin(prisma: PrismaService, input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
  const username = input.username.normalize("NFKC").trim().toLowerCase();
  const displayName = input.displayName.normalize("NFKC").trim();
  validateIdentity(username, displayName);
  validatePassword(
    input.password,
    username,
    input.allowInsecureQaCredential === true && process.env.APP_ENV === "staging",
  );
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

/**
 * 로그인 ID(영문 소문자·숫자·`._-` 3~120자)와 표시 이름(1~120자) 확인
 *
 * @throws {Error} 형식 위반
 */
function validateIdentity(username: string, displayName: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(username)) throw new Error("ADMIN_BOOTSTRAP_USERNAME is invalid");
  if (displayName.length < 1 || displayName.length > 120) throw new Error("ADMIN_BOOTSTRAP_DISPLAY_NAME is invalid");
}

/**
 * 비밀번호 정책 확인
 *
 * 14~512자, 소문자·대문자·숫자·기호 포함, ID 포함 금지. QA 예외는 `admin`/`admin`만 허용
 *
 * @throws {Error} 정책 위반
 */
function validatePassword(password: string, username: string, allowInsecureQaCredential: boolean): void {
  if (allowInsecureQaCredential && username === "admin" && password === "admin") return;
  const strong = password.length >= 14 && password.length <= 512
    && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  if (!strong || password.toLowerCase().includes(username)) throw new Error("The bootstrap password does not meet policy");
}

/**
 * 비밀번호 원문 읽기
 *
 * 환경 변수 직접 값과 파일 디스크립터 중 정확히 하나만 허용. 디스크립터에서 읽은 버퍼는 사용 후 0으로 덮어씀
 *
 * @throws {Error} 두 값 모두 있거나 없음, 디스크립터 번호 형식 오류
 */
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

/**
 * 인자·환경 변수를 읽어 관리자 계정 준비 실행. `--rotate` 외 인자 거부
 */
async function main(): Promise<void> {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--rotate");
  if (unknownArguments.length > 0) throw new Error("Only --rotate is accepted");
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? "";
  const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "";
  const password = passwordFromEnvironment();
  const allowInsecureQaCredential = process.env.APP_ENV === "staging"
    && process.env.ADMIN_BOOTSTRAP_ALLOW_INSECURE_QA_CREDENTIAL === "true";
  const context = await NestFactory.createApplicationContext(BootstrapAdminModule, { logger: false });
  try {
    const result = await bootstrapAdmin(context.get(PrismaService), {
      username, displayName, password, rotate: process.argv.includes("--rotate"), allowInsecureQaCredential,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

// 모듈로 import될 때는 실행하지 않고 직접 실행할 때만 main 호출
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Administrator bootstrap failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
