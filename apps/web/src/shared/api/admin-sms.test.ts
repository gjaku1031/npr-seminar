/**
 * 문자 어댑터 순수 헬퍼 테스트 (node:test + tsx).
 *
 * 여기서 지키려는 것은 "안 보내는 것"이다 — 이 파일은 fetch 를 부르지 않고, 실제 게이트웨이나
 * 큐를 건드리지 않는다. 검증 대상은 전부 순수 함수다.
 *
 * 픽스처는 계약(openapi.yaml SMS 스키마)의 **필수 필드를 전부** 채운 실제 응답 모양이다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySmsSendFailure,
  isLastActiveTemplate,
  isSmsSendDisabled,
  primarySample,
  smsContentErrorMessage,
  smsOutcomeOf,
  smsReadinessWarning,
  smsSuccessRate,
  toSmsLogRows,
} from "./admin-sms";
import { ApiError } from "./problem";
import type {
  SmsBatchSummary,
  SmsGatewayReadiness,
  SmsMessageList,
  SmsMessageSummary,
  SmsTargetPreview,
  SmsTemplate,
} from "./contract";

/* ── 픽스처 ──────────────────────────────────────────────────────────────── */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** 계약 SmsTargetPreview 필수 필드 전부. */
const preview = (overrides: Partial<SmsTargetPreview> = {}): SmsTargetPreview => ({
  branch: "SONGPA",
  seminarSessionId: SESSION_ID,
  audience: "BOOKED_FAMILIES",
  recipientCount: 2,
  previewToken: "preview-token-value-0001",
  maskedRecipients: ["***-****-1234", "***-****-5678"],
  templateId: "22222222-2222-4222-8222-222222222222",
  templateName: "설명회 안내",
  messageTemplate: "[npr] {학생명}님 {설명회명} 안내",
  titleTemplate: null,
  samples: [
    {
      familyBookingId: "33333333-3333-4333-8333-333333333333",
      maskedRecipient: "***-****-1234",
      message: "[npr] 김수민님 고3 설명회 안내",
      title: null,
      messageType: "SMS",
      messageBytes: 44,
      titleBytes: null,
    },
    {
      familyBookingId: "44444444-4444-4444-8444-444444444444",
      maskedRecipient: "***-****-5678",
      message: "[npr] 박지훈님 고3 설명회 안내",
      title: null,
      messageType: "SMS",
      messageBytes: 44,
      titleBytes: null,
    },
  ],
  maximumMessageType: "SMS",
  maximumMessageBytes: 44,
  maximumTitleBytes: null,
  ...overrides,
});

const problem = (status: number, code: string): ApiError =>
  new ApiError({ kind: "problem", status, code, message: "실패" });

/* ── 프리뷰 표본 ─────────────────────────────────────────────────────────── */

describe("primarySample", () => {
  it("첫 번째 치환 표본을 준다 — 확인 화면·폰 미리보기가 이 값을 쓴다", () => {
    const sample = primarySample(preview());

    assert.equal(sample?.message, "[npr] 김수민님 고3 설명회 안내");
    assert.equal(sample?.maskedRecipient, "***-****-1234");
  });

  it("수신자가 0 명이면 null 이다 — 원문을 표본인 척 돌려주지 않는다", () => {
    const empty = preview({
      recipientCount: 0,
      samples: [],
      maskedRecipients: [],
      maximumMessageType: null,
      maximumMessageBytes: null,
      maximumTitleBytes: null,
    });

    assert.equal(primarySample(empty), null);
    // 원문은 여전히 읽을 수 있어야 한다 (화면이 "치환 전"이라고 밝히고 보여 준다).
    assert.equal(empty.messageTemplate, "[npr] {학생명}님 {설명회명} 안내");
  });
});

/* ── 게이트웨이 준비 상태 ────────────────────────────────────────────────── */

const readiness = (overrides: Partial<SmsGatewayReadiness> = {}): SmsGatewayReadiness => ({
  enabled: true,
  configured: true,
  allowlistEnabled: false,
  testMode: false,
  // 계약: HTTP API 프로세스에서는 항상 false / const true.
  adapterAvailable: false,
  workerOnly: true,
  ...overrides,
});

describe("isSmsSendDisabled", () => {
  it("adapterAvailable:false + workerOnly 는 정상이다 — 막지 않는다", () => {
    assert.equal(isSmsSendDisabled(readiness()), false);
  });

  it("API 로컬 시크릿이 없어도(configured:false) 막지 않는다 — 워커가 따로 설정돼 있다", () => {
    assert.equal(isSmsSendDisabled(readiness({ configured: false })), false);
  });

  it("기능 자체가 꺼져 있으면 막는다", () => {
    assert.equal(isSmsSendDisabled(readiness({ enabled: false })), true);
  });

  it("준비 상태를 못 읽었으면(null) 막지 않는다 — 관측 실패가 장애가 되면 안 된다", () => {
    assert.equal(isSmsSendDisabled(null), false);
  });
});

describe("smsReadinessWarning", () => {
  it("정상 배포에서는 배너를 만들지 않는다", () => {
    assert.equal(smsReadinessWarning(readiness()), null);
  });

  it("configured:false 만으로는 경고하지 않는다", () => {
    assert.equal(smsReadinessWarning(readiness({ configured: false })), null);
  });

  it("기능이 꺼져 있으면 그 사실을 말한다", () => {
    assert.match(smsReadinessWarning(readiness({ enabled: false })) ?? "", /꺼져/);
  });

  it("테스트 모드·허용목록은 알려 준다", () => {
    assert.match(smsReadinessWarning(readiness({ testMode: true })) ?? "", /테스트/);
    assert.match(smsReadinessWarning(readiness({ allowlistEnabled: true })) ?? "", /허용목록/);
  });
});

/* ── 발송 실패 분류 ──────────────────────────────────────────────────────── */

describe("classifySmsSendFailure", () => {
  it("SMS_PREVIEW_TOKEN_CHANGED 는 다시 확인받게 한다 — 같은 토큰 재시도를 권하지 않는다", () => {
    const failure = classifySmsSendFailure(problem(409, "SMS_PREVIEW_TOKEN_CHANGED"));

    assert.equal(failure.action, "re-preview");
    // 아무것도 큐에 들어가지 않았다는 사실을 사용자에게 분명히 말해야 한다.
    assert.match(failure.message, /발송하지 않았어요/);
  });

  it("네트워크 실패는 같은 키·같은 토큰 재시도다 — 서버가 이미 처리했을 수 있다", () => {
    const failure = classifySmsSendFailure(
      new ApiError({ kind: "network", status: 0, code: "NETWORK_ERROR", message: "실패" }),
    );

    assert.equal(failure.action, "retry-same");
  });

  it("5xx 도 결과 미상이라 같은 키로 재시도한다", () => {
    assert.equal(classifySmsSendFailure(problem(500, "INTERNAL")).action, "retry-same");
    assert.equal(classifySmsSendFailure(problem(503, "SMS_GATEWAY_UNAVAILABLE")).action, "retry-same");
  });

  it("503 은 발송 여부를 단정하지 않는다", () => {
    assert.match(classifySmsSendFailure(problem(503, "X")).message, /확인할 수 없어요/);
  });

  it("본문·변수 오류는 고쳐야 풀린다 — 동일 재시도를 권하지 않는다", () => {
    const failure = classifySmsSendFailure(problem(400, "SMS_TEMPLATE_VARIABLE_UNKNOWN"));

    assert.equal(failure.action, "edit");
    assert.match(failure.message, /변수/);
  });

  it("404 는 대상이 사라진 것이라 다시 확인받는다", () => {
    assert.equal(classifySmsSendFailure(problem(404, "SEMINAR_SESSION_NOT_FOUND")).action, "re-preview");
  });

  it("그 밖의 확정 4xx 는 edit 이다 — 같은 내용 재시도는 같은 실패다", () => {
    assert.equal(classifySmsSendFailure(problem(409, "IDEMPOTENCY_KEY_REUSED")).action, "edit");
    assert.equal(classifySmsSendFailure(problem(403, "FORBIDDEN")).action, "edit");
  });

  it("ApiError 가 아니면 결과 미상으로 본다 — 발송되지 않았다고 단정하지 않는다", () => {
    assert.equal(classifySmsSendFailure(new Error("boom")).action, "retry-same");
  });
});

describe("smsContentErrorMessage", () => {
  it("본문 관련 코드만 문구를 준다", () => {
    assert.match(smsContentErrorMessage(problem(400, "SMS_MESSAGE_SIZE_INVALID")) ?? "", /2,000 byte/);
    assert.match(smsContentErrorMessage(problem(409, "SMS_STUDENT_NAME_MISSING")) ?? "", /학생 이름/);
  });

  it("관계없는 오류에는 관여하지 않는다", () => {
    assert.equal(smsContentErrorMessage(problem(500, "INTERNAL")), null);
    assert.equal(smsContentErrorMessage(new Error("boom")), null);
  });
});

/* ── 이력 ────────────────────────────────────────────────────────────────── */

describe("smsOutcomeOf", () => {
  it("CLAIMED·SENDING 은 대기다 (서버 배치 집계와 같은 기준)", () => {
    assert.equal(smsOutcomeOf("PENDING"), "pending");
    assert.equal(smsOutcomeOf("CLAIMED"), "pending");
    assert.equal(smsOutcomeOf("SENDING"), "pending");
  });

  it("차단·미상·DEAD 는 서버와 같이 실패로 센다", () => {
    assert.equal(smsOutcomeOf("BLOCKED_ALLOWLIST"), "failure");
    assert.equal(smsOutcomeOf("BLOCKED_DISABLED"), "failure");
    assert.equal(smsOutcomeOf("DELIVERY_UNKNOWN"), "failure");
    assert.equal(smsOutcomeOf("DEAD"), "failure");
    assert.equal(smsOutcomeOf("FAILED_PERMANENT"), "failure");
  });

  it("SENT 만 성공이다", () => {
    assert.equal(smsOutcomeOf("SENT"), "success");
  });
});

const batch = (overrides: Partial<SmsBatchSummary> = {}): SmsBatchSummary => ({
  batchId: "55555555-5555-4555-8555-555555555555",
  source: "ADMIN_GROUP",
  templateId: "22222222-2222-4222-8222-222222222222",
  templateName: "설명회 안내",
  audience: "BOOKED_FAMILIES",
  seminarSessionId: SESSION_ID,
  branch: "SONGPA",
  recipientCount: 3,
  successCount: 2,
  failureCount: 1,
  pendingCount: 0,
  status: "PARTIAL",
  actorSubject: "admin",
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:05:00.000Z",
  ...overrides,
});

const message = (overrides: Partial<SmsMessageSummary> = {}): SmsMessageSummary => ({
  messageId: "66666666-6666-4666-8666-666666666666",
  batchId: "55555555-5555-4555-8555-555555555555",
  source: "ADMIN_GROUP",
  branch: "SONGPA",
  seminarSessionId: SESSION_ID,
  familyBookingId: "33333333-3333-4333-8333-333333333333",
  templateId: "22222222-2222-4222-8222-222222222222",
  templateName: "설명회 안내",
  audience: "BOOKED_FAMILIES",
  maskedRecipient: "***-****-1234",
  messageType: "SMS",
  messageBytes: 44,
  status: "SENT",
  attemptCount: 1,
  providerMessageId: null,
  providerResultCode: null,
  lastErrorCode: null,
  actorSubject: "admin",
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:00:00.000Z",
  ...overrides,
});

const list = (overrides: Partial<SmsMessageList> = {}): SmsMessageList => ({
  batches: [],
  items: [],
  ...overrides,
});

describe("toSmsLogRows", () => {
  it("서버 배치 집계를 그대로 한 줄로 쓴다 — 다시 세지 않는다", () => {
    const rows = toSmsLogRows(list({ batches: [batch()] }));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].batched, true);
    assert.equal(rows[0].recipientCount, 3);
    assert.equal(rows[0].successCount, 2);
    assert.equal(rows[0].failureCount, 1);
    assert.equal(rows[0].status, "PARTIAL");
    assert.equal(rows[0].templateName, "설명회 안내");
  });

  it("배치에 속한 items 를 다시 묶어 이중 계상하지 않는다", () => {
    // 서버는 배치 집계와 그 구성원 행을 **함께** 준다. 둘 다 세면 수신 인원이 배로 뛴다.
    const rows = toSmsLogRows(
      list({
        batches: [batch({ recipientCount: 3, successCount: 2, failureCount: 1, pendingCount: 0 })],
        items: [
          message({ messageId: "m1", status: "SENT" }),
          message({ messageId: "m2", status: "SENT" }),
          message({ messageId: "m3", status: "FAILED_PERMANENT" }),
        ],
      }),
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].recipientCount, 3);
    assert.equal(rows[0].successCount, 2);
  });

  it("배치에 속하지 않는 단건만 따로 한 줄이 된다", () => {
    const rows = toSmsLogRows(
      list({
        batches: [batch()],
        items: [
          message({ messageId: "m1", status: "SENT" }),
          message({
            messageId: "m9",
            batchId: null,
            source: "OTP",
            templateId: null,
            templateName: null,
            audience: null,
            status: "SENT",
            createdAt: "2026-07-17T02:00:00.000Z",
          }),
        ],
      }),
    );

    assert.equal(rows.length, 2);
    const loose = rows.find((row) => !row.batched);
    assert.equal(loose?.recipientCount, 1);
    assert.equal(loose?.successCount, 1);
    assert.equal(loose?.maskedRecipient, "***-****-1234");
    // 서버가 주지 않은 이름·대상은 지어내지 않는다.
    assert.equal(loose?.templateName, null);
    assert.equal(loose?.audience, null);
  });

  it("최신이 위로 온다", () => {
    const rows = toSmsLogRows(
      list({
        batches: [
          batch({ batchId: "b-old", createdAt: "2026-07-17T01:00:00.000Z" }),
          batch({ batchId: "b-new", createdAt: "2026-07-17T05:00:00.000Z" }),
        ],
      }),
    );

    assert.equal(rows[0].id, "b-new");
  });

  it("빈 응답은 빈 목록이다", () => {
    assert.deepEqual(toSmsLogRows(list()), []);
  });
});

describe("smsSuccessRate", () => {
  it("확정된 건이 없으면 null 이다 — 100% 라고 쓰지 않는다", () => {
    const rows = toSmsLogRows(
      list({ batches: [batch({ recipientCount: 3, successCount: 0, failureCount: 0, pendingCount: 3, status: "QUEUED" })] }),
    );

    assert.equal(smsSuccessRate(rows), null);
  });

  it("대기 건은 분모에서 뺀다 — 발송 직후 0% 로 보이면 안 된다", () => {
    const rows = toSmsLogRows(
      list({ batches: [batch({ recipientCount: 3, successCount: 1, failureCount: 0, pendingCount: 2, status: "PROCESSING" })] }),
    );

    assert.equal(smsSuccessRate(rows), 100);
  });

  it("서버가 센 성공·실패로 비율을 낸다", () => {
    const rows = toSmsLogRows(
      list({ batches: [batch({ recipientCount: 4, successCount: 3, failureCount: 1, pendingCount: 0 })] }),
    );

    assert.equal(smsSuccessRate(rows), 75);
  });

  it("배치와 단건을 함께 센다", () => {
    const rows = toSmsLogRows(
      list({
        batches: [batch({ recipientCount: 3, successCount: 3, failureCount: 0, pendingCount: 0, status: "COMPLETED" })],
        items: [message({ messageId: "m9", batchId: null, status: "FAILED_PERMANENT" })],
      }),
    );

    assert.equal(smsSuccessRate(rows), 75);
  });
});

/* ── 템플릿 보호 ─────────────────────────────────────────────────────────── */

const template = (overrides: Partial<SmsTemplate> = {}): SmsTemplate => ({
  templateId: "t1",
  key: "GROUP_A",
  name: "안내",
  purpose: "ADMIN_GROUP",
  title: null,
  body: "[npr] 안내",
  active: true,
  version: "1",
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:00:00.000Z",
  ...overrides,
});

describe("isLastActiveTemplate", () => {
  it("활성이 하나뿐이면 그것이 마지막이다", () => {
    const templates = [template({ templateId: "t1" }), template({ templateId: "t2", active: false })];

    assert.equal(isLastActiveTemplate(templates, "t1"), true);
  });

  it("활성이 둘이면 지울 수 있다", () => {
    const templates = [template({ templateId: "t1" }), template({ templateId: "t2" })];

    assert.equal(isLastActiveTemplate(templates, "t1"), false);
  });

  it("보관된 템플릿은 마지막 활성이 아니다", () => {
    const templates = [template({ templateId: "t1" }), template({ templateId: "t2", active: false })];

    assert.equal(isLastActiveTemplate(templates, "t2"), false);
  });
});
