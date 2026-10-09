import { type FactoryProvider } from "@nestjs/common";
import { z } from "zod";

/**
 * 선택 비밀 키 검증. 정규 base64로 인코딩한 정확히 32바이트만 허용
 */
const optionalBase64Key = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}, "must be canonical base64 encoding of exactly 32 bytes").optional();

/**
 * 선택 저장 디렉터리 경로 검증. 루트가 아닌 절대 경로, `..`·NUL·`//` 시작 금지
 */
const optionalAbsoluteStoragePath = z.string().min(2).max(4_096).refine(
  (value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\0")
    && !value.split("/").includes(".."),
  "must be a non-root absolute path without parent traversal",
).optional();

/**
 * 같은 출처 경로 참조. `/`로 시작, `..`·쿼리·프래그먼트·공백 금지
 */
const safeRelativePath = z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|[?#]))[^\s]*$/, "must be a safe absolute-path reference");

/**
 * 같은 출처 URL 참조. 쿼리는 허용, `..`·프래그먼트·공백 금지
 */
const safeRelativeUrl = z.string().regex(/^\/(?!\/)(?!.*(?:\.\.|#))[^\s]*$/, "must be a safe same-origin URL reference");

/**
 * 외부 폼 필드명. 1~100자
 */
const wireField = z.string().min(1).max(100);

/**
 * 응답 HTML 판별 문자열. 1~500자
 */
const wireMarker = z.string().min(1).max(500);

/**
 * 외부 응답·요청 문자 인코딩
 */
const wireCharset = z.enum(["utf-8", "cp949"]);

/**
 * 통통통 학원 관리 시스템 연동 계약 스키마
 *
 * 외부 화면의 경로·폼 필드·판별 문자열을 코드에 넣지 않고 JSON 설정으로 받음
 * 알 수 없는 키는 strict로 거부
 */
const tongWireContractSchema = z.object({
  // 로그인 화면·보안 처리 요청·로그인 성공 판별
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
  // 지점 전환 요청
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
  // 학생 목록 프레임·그리드 조회와 페이지 상한
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
  // 그리드 열 이름과 학생 필드 대응. 아버지 연락처 열만 선택
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
  // 응답 크기 상한(바이트)과 요청 제한 시간(밀리초)
  maxResponseBytes: z.number().int().min(1_024).max(32 * 1024 * 1024),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(10_000),
}).strict();

/**
 * 검증된 통통통 연동 계약
 */
export type TongWireContractConfiguration = z.infer<typeof tongWireContractSchema>;

/**
 * 프로세스 환경 변수 스키마
 *
 * 비밀 값은 모두 선택으로 받고, production 필수 여부는 environmentProvider에서 역할별로 판단
 */
const environmentSchema = z.object({
  // 실행 환경·프로세스 역할·포트
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PROCESS_ROLE: z.enum(["api", "worker"]).default("api"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // 저장소 연결
  DATABASE_URL: z.string().url().optional(),
  WORKER_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  // 암호화·서명 키. 서로 다른 값이어야 함
  SESSION_SECRET: optionalBase64Key,
  PHONE_ENCRYPTION_KEY: optionalBase64Key,
  PHONE_HMAC_KEY: optionalBase64Key,
  OTP_PEPPER: optionalBase64Key,
  SCANNER_PAIRING_HMAC_KEY: optionalBase64Key,
  QR_ENCRYPTION_KEY: optionalBase64Key,
  // 공개 기준 URL과 포스터 저장 위치
  PUBLIC_BASE_URL: z.string().url().optional(),
  POSTER_STORAGE_DIR: optionalAbsoluteStoragePath,
  // 알리고 문자 발송. 자격 증명은 워커 전용, 수신자 허용 목록은 기본 사용
  ALIGO_IDENTIFIER: z.string().min(1).optional(),
  ALIGO_KEY: z.string().min(1).optional(),
  SMS_ENABLED: z.enum(["true", "false"]).default("false"),
  SMS_RECIPIENT_ALLOWLIST_ENABLED: z.enum(["true", "false"]).default("true"),
  SMS_TEST_RECIPIENTS: z.string().default(""),
  SMS_SENDER_CAMPUS_A: z.string().optional(),
  SMS_SENDER_CAMPUS_B: z.string().optional(),
  SMS_SENDER_CAMPUS_C: z.string().optional(),
  SMS_ALIGO_TEST_MODE: z.enum(["true", "false"]).default("true"),
  // Google Sheets 반영. 자격 증명은 워커 전용
  GOOGLE_SHEETS_ENABLED: z.enum(["true", "false"]).default("false"),
  GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT: z.enum(["true", "false"]).default("false"),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(20).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
  // 신뢰할 프록시 단계 수
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  // 통통통 학생 동기화
  TONG_SYNC_ENABLED: z.enum(["true", "false"]).default("false"),
  TONG_WIRE_CONTRACT_CONFIRMED: z.enum(["true", "false"]).default("false"),
  TONG_WIRE_CONTRACT_JSON: z.string().min(2).optional(),
  TONG_BASE_URL: z.string().url().optional(),
  TONG_USERNAME: z.string().min(1).optional(),
  TONG_PASSWORD: z.string().min(1).optional(),
  // 세션 유휴·절대 만료(초)
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(600).max(604_800).default(86_400),
});

/**
 * 검증·정규화한 실행 환경
 *
 * 선택 값은 설정되지 않으면 키 자체가 없음
 */
export interface AppEnvironment {
  /**
   * 실행 환경 구분
   */
  readonly appEnv: "local" | "test" | "staging" | "production";

  /**
   * 프로세스 역할. api는 HTTP 서버, worker는 문자·시트 발송 워커
   */
  readonly processRole: "api" | "worker";

  /**
   * HTTP 수신 포트
   */
  readonly port: number;

  /**
   * API 프로세스 DB 연결 URL
   */
  readonly databaseUrl?: string;

  /**
   * 워커 전용 DB 연결 URL. 워커 권한 계정 사용
   */
  readonly workerDatabaseUrl?: string;

  /**
   * Redis 연결 URL. 세션·속도 제한 저장소
   */
  readonly redisUrl?: string;

  /**
   * 세션 서명 키(base64, 32바이트)
   */
  readonly sessionSecret?: string;

  /**
   * 연락처·문자·시트 페이로드 암호화 루트 키(base64, 32바이트)
   */
  readonly phoneEncryptionKey?: string;

  /**
   * 연락처 조회용 HMAC 키(base64, 32바이트)
   */
  readonly phoneHmacKey?: string;

  /**
   * OTP 해시 pepper(base64, 32바이트)
   */
  readonly otpPepper?: string;

  /**
   * 스캐너 페어링 코드 HMAC 키(base64, 32바이트)
   */
  readonly scannerPairingHmacKey?: string;

  /**
   * 예약 QR 토큰 암호화 키(base64, 32바이트)
   */
  readonly qrEncryptionKey?: string;

  /**
   * 공개 기준 URL. 출처 검사와 링크 생성 기준
   */
  readonly publicBaseUrl?: string;

  /**
   * 포스터 이미지 저장 디렉터리 절대 경로. API 프로세스 전용
   */
  readonly posterStorageDir?: string;

  /**
   * 알리고 계정 ID. 워커 전용
   */
  readonly aligoIdentifier?: string;

  /**
   * 알리고 API 키. 워커 전용
   */
  readonly aligoKey?: string;

  /**
   * 문자 실제 발송 사용 여부
   */
  readonly smsEnabled: boolean;

  /**
   * 수신자 허용 목록 적용 여부. 켜져 있으면 smsTestRecipients에만 발송
   */
  readonly smsRecipientAllowlistEnabled: boolean;

  /**
   * 허용 수신 번호 집합. 숫자만 남긴 8~15자리
   */
  readonly smsTestRecipients: ReadonlySet<string>;

  /**
   * 지점별 발신 번호. 숫자만 남긴 값, 미설정 지점은 undefined
   */
  readonly smsSenders: Readonly<Record<"CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C", string | undefined>>;

  /**
   * 알리고 테스트 모드 여부. 켜져 있으면 실제 문자 미발송
   */
  readonly smsAligoTestMode: boolean;

  /**
   * Google Sheets 반영 사용 여부
   */
  readonly googleSheetsEnabled: boolean;

  /**
   * 개발 환경에서 공개 편집 권한 시트 쓰기 허용 여부. 워커 전용
   */
  readonly googleSheetsAllowPublicWriterInDevelopment?: boolean;

  /**
   * 대상 스프레드시트 ID
   */
  readonly googleSheetsSpreadsheetId?: string;

  /**
   * 서비스 계정 자격 증명 파일 경로. 워커 전용
   */
  readonly googleApplicationCredentials?: string;

  /**
   * Express trust proxy 단계 수(0~2)
   */
  readonly trustProxy: number;

  /**
   * 통통통 정기 동기화 사용 여부
   */
  readonly tongSyncEnabled: boolean;

  /**
   * 통통통 연동 계약 확인 여부. 켜져 있으면 계약·접속 정보 모두 필수
   */
  readonly tongWireContractConfirmed?: boolean;

  /**
   * 검증된 통통통 연동 계약
   */
  readonly tongWireContract?: TongWireContractConfiguration;

  /**
   * 통통통 HTTPS 출처
   */
  readonly tongBaseUrl?: string;

  /**
   * 통통통 로그인 계정
   */
  readonly tongUsername?: string;

  /**
   * 통통통 로그인 비밀번호
   */
  readonly tongPassword?: string;

  /**
   * 세션 유휴 만료(초)
   */
  readonly sessionIdleTtlSeconds: number;

  /**
   * 세션 절대 만료(초)
   */
  readonly sessionAbsoluteTtlSeconds: number;
}

/**
 * APP_ENVIRONMENT 제공자
 *
 * 1. 환경 변수 스키마 검증
 * 2. production 필수 값을 프로세스 역할별로 확인
 * 3. 비밀 자격 증명이 허용된 프로세스에만 주어졌는지 확인
 * 4. 통통통 계약 JSON·출처 검증
 * 5. 암호화 키 중복 금지, 문자 수신·발신 번호 정규화
 *
 * @throws {Error} 설정 누락·역할 위반·형식 오류 시 기동 중단
 */
export const environmentProvider: FactoryProvider<AppEnvironment> = {
  provide: "APP_ENVIRONMENT",
  useFactory: (): AppEnvironment => {
    const parsed = environmentSchema.parse(process.env);
    // 워커는 문자·시트 발송에 필요한 값만, API는 세션·암호화·포스터까지 필수
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
    // 자격 증명 격리: Google 자격 증명은 워커 전용, 포스터 저장소는 API 전용
    if (parsed.PROCESS_ROLE === "api" && parsed.GOOGLE_APPLICATION_CREDENTIALS !== undefined) {
      throw new Error("The HTTP API process must not receive Google service-account credentials");
    }
    if (parsed.PROCESS_ROLE === "worker" && parsed.POSTER_STORAGE_DIR !== undefined) {
      throw new Error("Poster storage is restricted to the HTTP API process");
    }
    if (parsed.PROCESS_ROLE === "api" && parsed.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT === "true") {
      throw new Error("The Google Sheets public-writer development override is restricted to the isolated worker");
    }
    // 연동 계약을 확인한 경우에만 계약 JSON과 접속 정보를 검증해 보관
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
      // 접속 기준은 자격 증명·경로·쿼리 없는 HTTPS 출처만 허용
      const baseUrl = new URL(parsed.TONG_BASE_URL);
      if (baseUrl.protocol !== "https:" || baseUrl.username !== "" || baseUrl.password !== ""
        || baseUrl.pathname !== "/" || baseUrl.search !== "" || baseUrl.hash !== "") {
        throw new Error("TONG_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment");
      }
    }
    // 워커에서 시트 반영을 켜면 워커 DB·시트 ID·자격 증명 모두 필요
    if (parsed.GOOGLE_SHEETS_ENABLED === "true" && parsed.PROCESS_ROLE === "worker" && (
      parsed.WORKER_DATABASE_URL === undefined
      || parsed.GOOGLE_SHEETS_SPREADSHEET_ID === undefined
      || parsed.GOOGLE_APPLICATION_CREDENTIALS === undefined
    )) {
      throw new Error("Enabled Google Sheets configuration is restricted to the isolated worker");
    }
    // 키 하나가 유출돼도 다른 용도로 쓰이지 않도록 모든 비밀 키가 서로 달라야 함
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
    // 문자 번호는 NFKC 정규화 후 숫자만 남김. 길이가 맞지 않는 허용 번호는 버림
    const normalizePhone = (value: string): string => value.normalize("NFKC").replaceAll(/\D/g, "");
    const smsTestRecipients = new Set(parsed.SMS_TEST_RECIPIENTS.split(",")
      .map(normalizePhone)
      .filter((value) => value.length >= 8 && value.length <= 15));
    const smsSenders = {
      CAMPUS_A: parsed.SMS_SENDER_CAMPUS_A === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_CAMPUS_A),
      CAMPUS_B: parsed.SMS_SENDER_CAMPUS_B === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_CAMPUS_B),
      CAMPUS_C: parsed.SMS_SENDER_CAMPUS_C === undefined ? undefined : normalizePhone(parsed.SMS_SENDER_CAMPUS_C),
    } as const;
    // 문자 발송 자격 증명은 워커 전용. 워커에서 켜면 계정·키·전 지점 발신 번호 필수
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
    // 선택 값은 설정된 경우에만 키를 포함
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
      // 비운영 환경도 기본은 테스트 모드. 격리된 staging은 종단 QA를 위해 실제 발송을 명시적으로 켤 수 있음
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
