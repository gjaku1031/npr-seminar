import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { AligoGateway } from "../../src/modules/sms/aligo.gateway.js";
import { SmsMessagePolicy } from "../../src/modules/sms/sms-message-policy.service.js";
import { SmsTemplateRenderer } from "../../src/modules/sms/sms-template-renderer.service.js";

function environment(overrides: Partial<AppEnvironment> = {}): AppEnvironment {
  return {
    appEnv: "test", processRole: "api", port: 4000, trustProxy: 0, tongSyncEnabled: false,
    smsEnabled: true, smsRecipientAllowlistEnabled: true,
    smsTestRecipients: new Set(["01000000001"]),
    smsSenders: { SONGPA: "0211111111", WIRYE: "0222222222", GWANGJIN: "0233333333" },
    smsAligoTestMode: true, aligoIdentifier: "test-identifier", aligoKey: "test-key",
    googleSheetsEnabled: false,
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    ...overrides,
  };
}

describe("SMS EUC-KR policy", () => {
  const policy = new SmsMessagePolicy();

  it("uses the 90 byte boundary authoritatively", () => {
    expect(policy.classify("가".repeat(45))).toMatchObject({ messageType: "SMS", messageBytes: 90 });
    expect(policy.classify("가".repeat(46))).toMatchObject({ messageType: "LMS", messageBytes: 92 });
  });

  it("rejects unrepresentable characters instead of replacing them", () => {
    expect(() => policy.classify("예약 완료 😀")).toThrowError(DomainError);
  });
});

describe("SMS template variables", () => {
  const renderer = new SmsTemplateRenderer();
  const context = {
    studentName: "김나래",
    seminarTitle: "입시 설명회",
    sessionDateTime: "2026.08.21(금) 11:00",
    place: "대강당",
    bookingUrl: "https://public.test/booking/00000000-0000-4000-8000-000000000001",
    inquiryPhone: "02-413-2652",
  };

  it("renders every allowed variable without exposing a bearer token", () => {
    const rendered = renderer.render(
      "{학생명}|{설명회명}|{일시}|{장소}|{QR링크}|{문의전화}|{설문링크}",
      context,
    );
    expect(rendered).toContain("김나래|입시 설명회|2026.08.21(금) 11:00|대강당");
    expect(rendered.match(/https:\/\/public\.test\/booking\//gu)).toHaveLength(2);
    expect(rendered).not.toContain("token");
  });

  it("rejects unknown, malformed, and unresolved variables", () => {
    expect(() => renderer.render("{학부모명}", context)).toThrowError(DomainError);
    expect(() => renderer.render("{학생명", context)).toThrowError(DomainError);
    expect(() => renderer.render("{QR링크}", { ...context, bookingUrl: "" })).toThrowError(DomainError);
  });
});

describe("Aligo gateway safety", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records disabled and allowlist blocks without an HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = { branch: "SONGPA" as const, recipient: "01000000001", message: "테스트", messageType: "SMS" as const, title: null };
    await expect(new AligoGateway(environment({ smsEnabled: false })).send(request)).resolves.toMatchObject({ kind: "BLOCKED_DISABLED" });
    await expect(new AligoGateway(environment({ smsTestRecipients: new Set() })).send(request)).resolves.toMatchObject({ kind: "BLOCKED_ALLOWLIST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forces test mode and accepts only a positive provider result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result_code: 1, msg_id: 123, msg_type: "SMS", success_cnt: 1, error_cnt: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AligoGateway(environment()).send({ branch: "WIRYE", recipient: "01000000001", message: "테스트", messageType: "SMS", title: null });
    expect(result).toMatchObject({ kind: "SENT", providerMessageId: "123" });
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(String(options.body)).toContain("testmode_yn=Y");
    expect(String(options.body)).toContain("sender=0222222222");
  });

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
      branch: "SONGPA",
      recipient: "01099999999",
      message: "테스트",
      messageType: "SMS",
      title: null,
    });

    expect(result).toMatchObject({ kind: "SENT", providerMessageId: "456" });
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain("receiver=01099999999");
  });

  it("distinguishes definite pre-connect failure from unknown acceptance", async () => {
    const preConnect = Object.assign(new TypeError("connect"), { cause: { code: "ENOTFOUND" } });
    const fetchMock = vi.fn().mockRejectedValueOnce(preConnect).mockRejectedValueOnce(new DOMException("timeout", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AligoGateway(environment());
    const request = { branch: "SONGPA" as const, recipient: "01000000001", message: "테스트", messageType: "SMS" as const, title: null };
    await expect(gateway.send(request)).resolves.toMatchObject({ kind: "RETRYABLE" });
    await expect(gateway.send(request)).resolves.toMatchObject({ kind: "DELIVERY_UNKNOWN" });
  });
});
