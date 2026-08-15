import { type FactoryProvider } from "@nestjs/common";
import { z } from "zod";

const optionalBase64Key = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}, "must be canonical base64 encoding of exactly 32 bytes").optional();

const optionalAbsoluteStoragePath = z.string().min(2).max(4_096).refine(
  (value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\0")
    && !value.split("/").includes(".."),
  "must be a non-root absolute path without parent traversal",
).optional();

const safeRelativePath = z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|[?#]))[^\s]*$/, "must be a safe absolute-path reference");
const safeRelativeUrl = z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|#))[^\s]*$/, "must be a safe same-origin URL reference");
const wireField = z.string().min(1).max(100);
const wireMarker = z.string().min(1).max(500);
const wireCharset = z.enum(["utf-8", "cp949"]);
const tongWireContractSchema = z.object({
  login: z.object({
    pagePath: safeRelativePath,
    academyCodeQueryField: wireField,
    academyCode: wireField,
    securityPath: safeRelativePath,
    usernameField: wireField,
    passwordField: wireField,
    academyCodeField: wireField,
    resultCodeField: wireField,
    actionField: wireField,
    successResultCodes: z.array(wireField).min(1).max(5),
    actionPathPrefix: safeRelativePath,
    defaultPath: safeRelativePath,
    topPath: safeRelativeUrl,
    passwordFormMarker: wireMarker,
    topRequiredMarkers: z.array(wireMarker).min(1).max(10),
    branchCodeMarkerPrefix: wireMarker,
    securityCharset: wireCharset,
    htmlCharset: wireCharset,
  }).strict(),
  switchBranch: z.object({
    path: safeRelativePath,
    paramField: wireField,
    paramValue: z.string().max(100),
    kindField: wireField,
    kindValue: wireField,
    usernameField: wireField,
    passwordField: wireField,
    targetField: wireField,
    targetValue: wireField,
    branchField: wireField,
  }).strict(),
  students: z.object({
    framePath: safeRelativeUrl,
    gridPath: safeRelativeUrl,
    rowsField: wireField,
    currentPageField: wireField,
    totalRecordsField: wireField,
    filterField: wireField,
    filterValue: z.literal("NN"),
    framePageField: wireField,
    framePageValue: z.literal("1"),
    pageField: wireField,
    pageSizeField: wireField,
    pageSize: z.number().int().min(1).max(5_000),
    searchFields: z.array(wireField).max(20),
    maxPages: z.number().int().min(1).max(100),
    maxRecords: z.number().int().min(1).max(500_000),
    charset: wireCharset,
  }).strict(),
  columns: z.object({
    sourceUniqueNo: wireField,
    classRegistrationNo: wireField,
    studentNo: wireField,
    name: wireField,
    className: wireField,
    motherPhone: wireField,
    fatherPhone: wireField.optional(),
    schoolName: wireField,
    grade: wireField,
    teacherName: wireField,
    unitName: wireField,
    sourceStatus: wireField,
  }).strict(),
  maxResponseBytes: z.number().int().min(1_024).max(32 * 1024 * 1024),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(10_000),
}).strict();

export type TongWireContractConfiguration = z.infer<typeof tongWireContractSchema>;

const environmentSchema = z.object({
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PROCESS_ROLE: z.enum(["api", "worker"]).default("api"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().optional(),
  WORKER_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  SESSION_SECRET: optionalBase64Key,
  PHONE_ENCRYPTION_KEY: optionalBase64Key,
  PHONE_HMAC_KEY: optionalBase64Key,
  OTP_PEPPER: optionalBase64Key,
  SCANNER_PAIRING_HMAC_KEY: optionalBase64Key,
  QR_ENCRYPTION_KEY: optionalBase64Key,
  PUBLIC_BASE_URL: z.string().url().optional(),
  POSTER_STORAGE_DIR: optionalAbsoluteStoragePath,
  ALIGO_IDENTIFIER: z.string().min(1).optional(),
  ALIGO_KEY: z.string().min(1).optional(),
  SMS_ENABLED: z.enum(["true", "false"]).default("false"),
  SMS_RECIPIENT_ALLOWLIST_ENABLED: z.enum(["true", "false"]).default("true"),
  SMS_TEST_RECIPIENTS: z.string().default(""),
  SMS_SENDER_SONGPA: z.string().optional(),
  SMS_SENDER_WIRYE: z.string().optional(),
  SMS_SENDER_GWANGJIN: z.string().optional(),
  SMS_ALIGO_TEST_MODE: z.enum(["true", "false"]).default("true"),
  GOOGLE_SHEETS_ENABLED: z.enum(["true", "false"]).default("false"),
  GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT: z.enum(["true", "false"]).default("false"),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(20).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  TONG_SYNC_ENABLED: z.enum(["true", "false"]).default("false"),
  TONG_WIRE_CONTRACT_CONFIRMED: z.enum(["true", "false"]).default("false"),
  TONG_WIRE_CONTRACT_JSON: z.string().min(2).optional(),
  TONG_BASE_URL: z.string().url().optional(),
  TONG_USERNAME: z.string().min(1).optional(),
  TONG_PASSWORD: z.string().min(1).optional(),
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(600).max(604_800).default(86_400),
});

export interface AppEnvironment {
  readonly appEnv: "local" | "test" | "staging" | "production";
  readonly processRole: "api" | "worker";
  readonly port: number;
  readonly databaseUrl?: string;
  readonly workerDatabaseUrl?: string;
  readonly redisUrl?: string;
  readonly sessionSecret?: string;
  readonly phoneEncryptionKey?: string;
  readonly phoneHmacKey?: string;
  readonly otpPepper?: string;
  readonly scannerPairingHmacKey?: string;
  readonly qrEncryptionKey?: string;
  readonly publicBaseUrl?: string;
  readonly posterStorageDir?: string;
  readonly aligoIdentifier?: string;
  readonly aligoKey?: string;
  readonly smsEnabled: boolean;
  readonly smsRecipientAllowlistEnabled: boolean;
  readonly smsTestRecipients: ReadonlySet<string>;
  readonly smsSenders: Readonly<Record<"SONGPA" | "WIRYE" | "GWANGJIN", string | undefined>>;
  readonly smsAligoTestMode: boolean;
  readonly googleSheetsEnabled: boolean;
  readonly googleSheetsAllowPublicWriterInDevelopment?: boolean;
  readonly googleSheetsSpreadsheetId?: string;
  readonly googleApplicationCredentials?: string;
  readonly trustProxy: number;
  readonly tongSyncEnabled: boolean;
  readonly tongWireContractConfirmed?: boolean;
  readonly tongWireContract?: TongWireContractConfiguration;
  readonly tongBaseUrl?: string;
  readonly tongUsername?: string;
  readonly tongPassword?: string;
  readonly sessionIdleTtlSeconds: number;
  readonly sessionAbsoluteTtlSeconds: number;
}

export const environmentProvider: FactoryProvider<AppEnvironment> = {
  provide: "APP_ENVIRONMENT",
  useFactory: (): AppEnvironment => {
    const parsed = environmentSchema.parse(process.env);
    const productionRequired = parsed.PROCESS_ROLE === "worker"
      ? [parsed.WORKER_DATABASE_URL, parsed.PHONE_ENCRYPTION_KEY, parsed.PUBLIC_BASE_URL]
      : [
        parsed.DATABASE_URL, parsed.REDIS_URL, parsed.SESSION_SECRET, parsed.PHONE_ENCRYPTION_KEY,
        parsed.PHONE_HMAC_KEY, parsed.OTP_PEPPER, parsed.SCANNER_PAIRING_HMAC_KEY,
        parsed.QR_ENCRYPTION_KEY, parsed.PUBLIC_BASE_URL, parsed.POSTER_STORAGE_DIR,
      ];
    if (parsed.APP_ENV === "production" && productionRequired.some((value) => value === undefined)) {
      throw new Error("Production configuration is incomplete");
    }
    if (parsed.PROCESS_ROLE === "api" && parsed.GOOGLE_APPLICATION_CREDENTIALS !== undefined) {
      throw new Error("The HTTP API process must not receive Google service-account credentials");
    }
    if (parsed.PROCESS_ROLE === "worker" && parsed.POSTER_STORAGE_DIR !== undefined) {
      throw new Error("Poster storage is restricted to the HTTP API process");
    }
    if (parsed.PROCESS_ROLE === "api" && parsed.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT === "true") {
      throw new Error("The Google Sheets public-writer development override is restricted to the isolated worker");
    }
    let tongWireContract: TongWireContractConfiguration | undefined;
    if (parsed.TONG_WIRE_CONTRACT_CONFIRMED === "true") {
      if (parsed.TONG_WIRE_CONTRACT_JSON === undefined || parsed.TONG_BASE_URL === undefined
        || parsed.TONG_USERNAME === undefined || parsed.TONG_PASSWORD === undefined) {
        throw new Error("Confirmed TongTongTong wire configuration is incomplete");
      }
      let rawContract: unknown;
      try {
        rawContract = JSON.parse(parsed.TONG_WIRE_CONTRACT_JSON);
      } catch {
        throw new Error("TONG_WIRE_CONTRACT_JSON must be valid JSON");
      }
      tongWireContract = tongWireContractSchema.parse(rawContract);
      const baseUrl = new URL(parsed.TONG_BASE_URL);
      if (baseUrl.protocol !== "https:" || baseUrl.username !== "" || baseUrl.password !== ""
        || baseUrl.pathname !== "/" || baseUrl.search !== "" || baseUrl.hash !== "") {
        throw new Error("TONG_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment");
      }
    }
    if (parsed.GOOGLE_SHEETS_ENABLED === "true" && parsed.PROCESS_ROLE === "worker" && (
      parsed.WORKER_DATABASE_URL === undefined
      || parsed.GOOGLE_SHEETS_SPREADSHEET_ID === undefined
      || parsed.GOOGLE_APPLICATION_CREDENTIALS === undefined
    )) {
      throw new Error("Enabled Google Sheets configuration is restricted to the isolated worker");
    }
    const configuredSecrets = [
      parsed.SESSION_SECRET,
      parsed.PHONE_ENCRYPTION_KEY,
      parsed.PHONE_HMAC_KEY,
      parsed.OTP_PEPPER,
      parsed.SCANNER_PAIRING_HMAC_KEY,
      parsed.QR_ENCRYPTION_KEY,
    ].filter((value): value is string => value !== undefined);
    if (new Set(configuredSecrets).size !== configuredSecrets.length) {
      throw new Error("Independent cryptographic keys are required");
    }
    const normalizePhone = (value: string): string => value.normalize("NFKC").replaceAll(/\D/g, "");
    const smsTestRecipients = new Set(parsed.SMS_TEST_RECIPIENTS.split(",")
      .map(normalizePhone)
      .filter((value) => value.length >= 8 && value.length <= 15));
    const smsSenders = {
      SONGPA: parsed.SMS_SENDER_SONGPA === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_SONGPA),
      WIRYE: parsed.SMS_SENDER_WIRYE === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_WIRYE),
      GWANGJIN: parsed.SMS_SENDER_GWANGJIN === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_GWANGJIN),
    } as const;
    if (parsed.PROCESS_ROLE === "api" && (parsed.ALIGO_IDENTIFIER !== undefined || parsed.ALIGO_KEY !== undefined)) {
      throw new Error("SMS provider credentials are restricted to the isolated worker");
    }
    if (parsed.SMS_ENABLED === "true" && parsed.PROCESS_ROLE === "worker" && (
      parsed.ALIGO_IDENTIFIER === undefined
      || parsed.ALIGO_KEY === undefined
      || Object.values(smsSenders).some((value) => value === undefined || value.length < 8 || value.length > 16)
    )) {
      throw new Error("Enabled SMS configuration is incomplete");
    }
    return {
      appEnv: parsed.APP_ENV,
      processRole: parsed.PROCESS_ROLE,
      port: parsed.PORT,
      ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
      ...(parsed.WORKER_DATABASE_URL === undefined ? {} : { workerDatabaseUrl: parsed.WORKER_DATABASE_URL }),
      ...(parsed.REDIS_URL === undefined ? {} : { redisUrl: parsed.REDIS_URL }),
      ...(parsed.SESSION_SECRET === undefined ? {} : { sessionSecret: parsed.SESSION_SECRET }),
      ...(parsed.PHONE_ENCRYPTION_KEY === undefined ? {} : { phoneEncryptionKey: parsed.PHONE_ENCRYPTION_KEY }),
      ...(parsed.PHONE_HMAC_KEY === undefined ? {} : { phoneHmacKey: parsed.PHONE_HMAC_KEY }),
      ...(parsed.OTP_PEPPER === undefined ? {} : { otpPepper: parsed.OTP_PEPPER }),
      ...(parsed.SCANNER_PAIRING_HMAC_KEY === undefined ? {} : { scannerPairingHmacKey: parsed.SCANNER_PAIRING_HMAC_KEY }),
      ...(parsed.QR_ENCRYPTION_KEY === undefined ? {} : { qrEncryptionKey: parsed.QR_ENCRYPTION_KEY }),
      ...(parsed.PUBLIC_BASE_URL === undefined ? {} : { publicBaseUrl: parsed.PUBLIC_BASE_URL }),
      ...(parsed.POSTER_STORAGE_DIR === undefined ? {} : { posterStorageDir: parsed.POSTER_STORAGE_DIR }),
      ...(parsed.ALIGO_IDENTIFIER === undefined ? {} : { aligoIdentifier: parsed.ALIGO_IDENTIFIER }),
      ...(parsed.ALIGO_KEY === undefined ? {} : { aligoKey: parsed.ALIGO_KEY }),
      smsEnabled: parsed.SMS_ENABLED === "true",
      smsRecipientAllowlistEnabled: parsed.SMS_RECIPIENT_ALLOWLIST_ENABLED === "true",
      smsTestRecipients,
      smsSenders,
      // Non-production environments default to provider test mode, but an isolated staging
      // stack may explicitly opt into real delivery for end-to-end QA.
      smsAligoTestMode: parsed.SMS_ALIGO_TEST_MODE === "true",
      googleSheetsEnabled: parsed.GOOGLE_SHEETS_ENABLED === "true",
      googleSheetsAllowPublicWriterInDevelopment:
        parsed.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT === "true",
      ...(parsed.GOOGLE_SHEETS_SPREADSHEET_ID === undefined ? {} : { googleSheetsSpreadsheetId: parsed.GOOGLE_SHEETS_SPREADSHEET_ID }),
      ...(parsed.GOOGLE_APPLICATION_CREDENTIALS === undefined ? {} : { googleApplicationCredentials: parsed.GOOGLE_APPLICATION_CREDENTIALS }),
      trustProxy: parsed.TRUST_PROXY,
      tongSyncEnabled: parsed.TONG_SYNC_ENABLED === "true",
      tongWireContractConfirmed: parsed.TONG_WIRE_CONTRACT_CONFIRMED === "true",
      ...(tongWireContract === undefined ? {} : { tongWireContract }),
      ...(parsed.TONG_BASE_URL === undefined ? {} : { tongBaseUrl: parsed.TONG_BASE_URL }),
      ...(parsed.TONG_USERNAME === undefined ? {} : { tongUsername: parsed.TONG_USERNAME }),
      ...(parsed.TONG_PASSWORD === undefined ? {} : { tongPassword: parsed.TONG_PASSWORD }),
      sessionIdleTtlSeconds: parsed.SESSION_IDLE_TTL_SECONDS,
      sessionAbsoluteTtlSeconds: parsed.SESSION_ABSOLUTE_TTL_SECONDS,
    };
  },
};
