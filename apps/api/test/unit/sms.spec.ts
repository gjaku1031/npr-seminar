import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { AligoGateway } from "../../src/modules/sms/aligo.gateway.js";
import { SmsMessagePolicy } from "../../src/modules/sms/sms-message-policy.service.js";
import { SmsTemplateRenderer } from "../../src/modules/sms/sms-template-renderer.service.js";

/**
 * 문자 발송이 켜진 테스트 실행 환경
 *
 * @param overrides 덮어쓸 값
 */
function environment(overrides: Partial<AppEnvironment> = {}): AppEnvironment {
  return {
    appEnv: "test", processRole: "api", port: 4000, trustProxy: 0, tongSyncEnabled: false,
    smsEnabled: true, smsRecipientAllowlistEnabled: true,
    smsTestRecipients: new Set(["01000000001"]),
    smsSenders: { CAMPUS_A: "0211111111", CAMPUS_B: "0222222222", CAMPUS_C: "0233333333" },
    smsAligoTestMode: true, aligoIdentifier: "test-identifier", aligoKey: "test-key",
    googleSheetsEnabled: false,
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    ...overrides,
  };
}

// EUC-KR 문자 길이 정책
describe("SMS EUC-KR policy", () => {
  // 길이 정책
  const policy = new SmsMessagePolicy();

  // 90바이트 경계로 SMS·LMS 결정
  it("uses the 90 byte boundary authoritatively", () => {
    expect(policy.classify("가".repeat(45))).toMatchObject({ messageType: "SMS", messageBytes: 90 });
    expect(policy.classify("가".repeat(46))).toMatchObject({ messageType: "LMS", messageBytes: 92 });
  });

  // EUC-KR로 표현할 수 없는 문자는 대체하지 않고 거부
  it("rejects unrepresentable characters instead of replacing them", () => {
    expect(() => policy.classify("예약 완료 😀")).toThrowError(DomainError);
  });
});

// 문자 템플릿 변수
describe("SMS template variables", () => {
  // 템플릿 렌더러
  const renderer = new SmsTemplateRenderer();

  // 치환 값
  const context = {
    studentName: "김나래",
    seminarTitle: "입시 설명회",
    sessionDateTime: "2026.08.21(금) 11:00",
    place: "대강당",
    bookingUrl: "https://public.test/booking/00000000-0000-4000-8000-000000000001",
    inquiryPhone: "02-000-0001",
  };

  // 허용 변수를 모두 치환하고 관리 링크 토큰은 노출하지 않음
  it("renders every allowed variable without exposing a bearer token", () => {
    const rendered = renderer.render(
      "{학생명}|{설명회명}|{일시}|{장소}|{QR링크}|{문의전화}",
      context,
    );
    expect(rendered).toContain("김나래|입시 설명회|2026.08.21(금) 11:00|대강당");
    expect(rendered.match(/https:\/\/public\.test\/booking\//gu)).toHaveLength(1);
    expect(rendered).not.toContain("token");
  });

  // 알 수 없는 변수·형식 오류·값 없는 변수 거부
  it("rejects unknown, malformed, and unresolved variables", () => {
    expect(() => renderer.render("{학부모명}", context)).toThrowError(DomainError);
    expect(() => renderer.render("{학생명", context)).toThrowError(DomainError);
    expect(() => renderer.render("{QR링크}", { ...context, bookingUrl: "" })).toThrowError(DomainError);
  });
});

// 알리고 게이트웨이 안전장치
describe("Aligo gateway safety", () => {
  // 전역 fetch 복원
  afterEach(() => vi.unstubAllGlobals());

  // 비활성·허용 목록 차단은 HTTP 호출 없이 결과로 기록
  it("records disabled and allowlist blocks without an HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = { branch: "CAMPUS_A" as const, recipient: "01000000001", message: "테스트", messageType: "SMS" as const, title: null };
    await expect(new AligoGateway(environment({ smsEnabled: false })).send(request)).resolves.toMatchObject({ kind: "BLOCKED_DISABLED" });
    await expect(new AligoGateway(environment({ smsTestRecipients: new Set() })).send(request)).resolves.toMatchObject({ kind: "BLOCKED_ALLOWLIST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 테스트 모드를 강제하고 양수 결과 코드만 접수 성공으로 판정
  it("forces test mode and accepts only a positive provider result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result_code: 1, msg_id: 123, msg_type: "SMS", success_cnt: 1, error_cnt: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AligoGateway(environment()).send({ branch: "CAMPUS_B", recipient: "01000000001", message: "테스트", messageType: "SMS", title: null });
    expect(result).toMatchObject({ kind: "SENT", providerMessageId: "123" });
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(String(options.body)).toContain("testmode_yn=Y");
    expect(String(options.body)).toContain("sender=0222222222");
  });

  // 허용 목록을 끄면 테스트 목록 밖 번호도 발송
  it("allows a valid recipient outside the test list when the allowlist is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result_code: 1,
      msg_id: 456,
      msg_type: "SMS",
      success_cnt: 1,
      error_cnt: 0,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AligoGateway(environment({
      smsRecipientAllowlistEnabled: false,
      smsTestRecipients: new Set(["01000000001"]),
    })).send({
      branch: "CAMPUS_A",
      recipient: "01099999999",
      message: "테스트",
      messageType: "SMS",
      title: null,
    });

    expect(result).toMatchObject({ kind: "SENT", providerMessageId: "456" });
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain("receiver=01099999999");
  });

  // 연결 전 확정 실패(재시도 가능)와 접수 여부 불명을 구분
  it("distinguishes definite pre-connect failure from unknown acceptance", async () => {
    const preConnect = Object.assign(new TypeError("connect"), { cause: { code: "ENOTFOUND" } });
    const fetchMock = vi.fn().mockRejectedValueOnce(preConnect).mockRejectedValueOnce(new DOMException("timeout", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AligoGateway(environment());
    const request = { branch: "CAMPUS_A" as const, recipient: "01000000001", message: "테스트", messageType: "SMS" as const, title: null };
    await expect(gateway.send(request)).resolves.toMatchObject({ kind: "RETRYABLE" });
    await expect(gateway.send(request)).resolves.toMatchObject({ kind: "DELIVERY_UNKNOWN" });
  });
});
