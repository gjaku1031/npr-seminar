import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import { SmsAdminController } from "../../src/modules/sms/sms-admin.controller.js";
import { SmsAdminService } from "../../src/modules/sms/sms-admin.service.js";

/**
 * 테스트 템플릿 생성 시각
 */
const createdAt = new Date("2026-07-19T00:00:00Z");

/**
 * 문자 템플릿 행
 *
 * @param overrides 덮어쓸 필드
 */
function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    publicId: "00000000-0000-4000-8000-000000000707",
    key: "REMOVAL_TEST",
    name: "삭제 테스트",
    purpose: "ADMIN_GROUP",
    title: null,
    body: "테스트",
    active: true,
    isDefault: false,
    version: 4n,
    createdBy: "test",
    updatedBy: "test",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/**
 * 멱등 실행을 바로 operation에 넘기는 관리자 문자 서비스와 호출 기록
 *
 * @param transaction operation에 전달할 가짜 트랜잭션
 */
function subject(transaction: Record<string, unknown>) {
  const execute = vi.fn(async (
    scope: string,
    key: string,
    request: unknown,
    operation: (value: typeof transaction) => Promise<unknown>,
  ) => operation(transaction));
  const service = new SmsAdminService(
    {} as never,
    { execute } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, execute };
}

// 문자 템플릿 삭제 수명 주기
describe("SMS template removal lifecycle", () => {
  // 사용 이력 없는 비기본 템플릿은 공용 잠금 아래 실제 삭제
  it("hard-deletes an unused non-default under the shared lifecycle lock", async () => {
    const calls: string[] = [];
    const current = template();
    const remove = vi.fn(async () => { calls.push("delete"); return current; });
    const transaction = {
      $executeRaw: vi.fn(async () => { calls.push("lock"); return 1; }),
      smsTemplate: {
        findUnique: vi.fn(async () => { calls.push("find"); return current; }),
        delete: remove,
      },
      smsOutbox: { count: vi.fn(async () => { calls.push("history"); return 0; }) },
    };
    const { service, execute } = subject(transaction);

    await expect(service.removeTemplate(current.publicId, "4", "admin:test", "remove-key-0001"))
      .resolves.toEqual({
        templateId: current.publicId,
        disposition: "DELETED",
        usageCount: 0,
        archivedTemplate: null,
      });
    expect(calls).toEqual(["lock", "find", "history", "delete"]);
    expect(remove).toHaveBeenCalledWith({ where: { id: 7n } });
    expect(execute).toHaveBeenCalledWith(
      "SMS_TEMPLATE_REMOVE",
      "remove-key-0001",
      { templateId: current.publicId, version: "4" },
      expect.any(Function),
    );
  });

  // 사용 이력이 있으면 비활성 보관하고 낙관적 잠금 버전 증가
  it("archives a used template and increments its optimistic version", async () => {
    const current = template();
    const archived = template({ active: false, version: 5n, updatedBy: "admin:test" });
    const update = vi.fn(async () => archived);
    const transaction = {
      $executeRaw: vi.fn(async () => 1),
      smsTemplate: { findUnique: vi.fn(async () => current), update },
      smsOutbox: { count: vi.fn(async () => 3) },
    };
    const { service } = subject(transaction);

    const result = await service.removeTemplate(current.publicId, "4", "admin:test", "remove-key-0002");
    expect(result).toMatchObject({
      templateId: current.publicId,
      disposition: "ARCHIVED",
      usageCount: 3,
      archivedTemplate: { active: false, isDefault: false, version: "5" },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: {
        active: false,
        isDefault: false,
        version: { increment: 1 },
        updatedBy: "admin:test",
      },
    });
  });

  // 현재 기본 템플릿은 사용 이력 조회 전에 거부
  it("refuses a current default before consulting usage history", async () => {
    const current = template({ isDefault: true });
    const history = vi.fn(async () => 0);
    const transaction = {
      $executeRaw: vi.fn(async () => 1),
      smsTemplate: { findUnique: vi.fn(async () => current) },
      smsOutbox: { count: history },
    };
    const { service } = subject(transaction);

    await expect(service.removeTemplate(current.publicId, "4", "admin:test", "remove-key-0003"))
      .rejects.toMatchObject({ code: "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED" });
    expect(history).not.toHaveBeenCalled();
  });

  // 삭제 경로에 CSRF 가드가 걸려 있음
  it("keeps DELETE behind the CSRF guard", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SmsAdminController.prototype.removeTemplate) as unknown[];
    expect(guards).toContain(CsrfGuard);
  });
});
