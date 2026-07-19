import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { LoginRequestDto } from "../../src/modules/admin-auth/admin-auth.controller.js";

describe("admin login request validation", () => {
  it("accepts the temporary five-character password and rejects shorter values", async () => {
    const temporary = Object.assign(new LoginRequestDto(), { username: "admin", password: "admin" });
    const tooShort = Object.assign(new LoginRequestDto(), { username: "admin", password: "four" });

    expect(await validate(temporary)).toHaveLength(0);
    expect(await validate(tooShort)).not.toHaveLength(0);
  });
});
