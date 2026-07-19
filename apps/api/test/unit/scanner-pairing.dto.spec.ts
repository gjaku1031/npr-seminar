import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ClaimPairingDto, ListScannerDevicesQueryDto } from "../../src/modules/scanner-devices/scanner-devices.controller.js";

describe("ClaimPairingDto", () => {
  it("normalizes whitespace and lowercase before enforcing the six-character alphabet", async () => {
    const dto = plainToInstance(ClaimPairingDto, {
      pairingCode: " 2abcz9 ",
      deviceName: "현장 스캐너",
      clientPlatform: "test",
    });
    expect(dto.pairingCode).toBe("2ABCZ9");
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(["ABC12", "ABC1234", "ABCI23", "ABCO23", "ABC1-3"]) (
    "rejects %s",
    async (pairingCode) => {
      const dto = plainToInstance(ClaimPairingDto, { pairingCode });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});

describe("ListScannerDevicesQueryDto", () => {
  it("defaults to active devices and transforms pagination values", async () => {
    const defaults = plainToInstance(ListScannerDevicesQueryDto, {});
    expect(defaults).toMatchObject({ status: "ACTIVE", page: 1, pageSize: 50 });
    expect(await validate(defaults)).toHaveLength(0);

    const explicit = plainToInstance(ListScannerDevicesQueryDto, {
      branch: "WIRYE",
      status: "UNPAIRED",
      page: "2",
      pageSize: "5",
    });
    expect(explicit).toMatchObject({ branch: "WIRYE", status: "UNPAIRED", page: 2, pageSize: 5 });
    expect(await validate(explicit)).toHaveLength(0);
  });

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
