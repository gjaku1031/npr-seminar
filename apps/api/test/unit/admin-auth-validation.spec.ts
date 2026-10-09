import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { LoginRequestDto } from "../../src/modules/admin-auth/admin-auth.controller.js";

// 관리자 로그인 요청 DTO 검증
describe("admin login request validation", () => {
  // 임시 비밀번호 5자는 통과, 4자 이하는 검증 오류
  it("accepts the temporary five-character password and rejects shorter values", async () => {
    const temporary = Object.assign(new LoginRequestDto(), { username: "admin", password: "admin" });
    const tooShort = Object.assign(new LoginRequestDto(), { username: "admin", password: "four" });

    expect(await validate(temporary)).toHaveLength(0);
    expect(await validate(tooShort)).not.toHaveLength(0);
  });
});
