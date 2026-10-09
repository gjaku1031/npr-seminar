import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ClaimPairingDto, ListScannerDevicesQueryDto } from "../../src/modules/scanner-devices/scanner-devices.controller.js";

// 페어링 코드 사용 DTO
describe("ClaimPairingDto", () => {
  // 공백 제거·대문자 변환 후 6자 허용 문자 집합 검사
  it("normalizes whitespace and lowercase before enforcing the six-character alphabet", async () => {
    const dto = plainToInstance(ClaimPairingDto, {
      pairingCode: " 2abcz9 ",
      deviceName: "현장 스캐너",
      clientPlatform: "test",
    });
    expect(dto.pairingCode).toBe("2ABCZ9");
    expect(await validate(dto)).toHaveLength(0);
  });

  // 길이 오류·혼동 문자(I·O)·기호가 든 코드는 거부
  it.each(["ABC12", "ABC1234", "ABCI23", "ABCO23", "ABC1-3"]) (
    "rejects %s",
    async (pairingCode) => {
      const dto = plainToInstance(ClaimPairingDto, { pairingCode });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});

// 관리자 기기 목록 쿼리 DTO
describe("ListScannerDevicesQueryDto", () => {
  // 기본 ACTIVE 상태와 페이지 값 숫자 변환
  it("defaults to active devices and transforms pagination values", async () => {
    const defaults = plainToInstance(ListScannerDevicesQueryDto, {});
    expect(defaults).toMatchObject({ status: "ACTIVE", page: 1, pageSize: 50 });
    expect(await validate(defaults)).toHaveLength(0);

    const explicit = plainToInstance(ListScannerDevicesQueryDto, {
      branch: "CAMPUS_B",
      status: "UNPAIRED",
      page: "2",
      pageSize: "5",
    });
    expect(explicit).toMatchObject({ branch: "CAMPUS_B", status: "UNPAIRED", page: 2, pageSize: 5 });
    expect(await validate(explicit)).toHaveLength(0);
  });

  // 알 수 없는 지점·상태, 잘못된 페이지 값 거부
  it.each([
    { branch: "UNKNOWN" },
    { status: "DELETED" },
    { page: "0" },
    { page: "1.5" },
    { pageSize: "0" },
    { pageSize: "201" },
  ])("rejects invalid list query %#", async (input) => {
    expect(await validate(plainToInstance(ListScannerDevicesQueryDto, input))).not.toHaveLength(0);
  });
});
