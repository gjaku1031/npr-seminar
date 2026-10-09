import { mkdtemp, readFile, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import {
  POSTER_MAX_BYTES,
  type PosterUploadFile,
  PosterService,
} from "../../src/modules/poster/poster.service.js";

/**
 * 서명이 맞는 최소 PNG
 */
function png(): Buffer {
  const value = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value);
  value.write("IHDR", 12, "ascii");
  return value;
}

/**
 * 서명이 맞는 최소 JPEG
 */
function jpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

/**
 * 서명이 맞는 최소 WebP
 */
function webp(): Buffer {
  const value = Buffer.alloc(16);
  value.write("RIFF", 0, "ascii");
  value.writeUInt32LE(8, 4);
  value.write("WEBP", 8, "ascii");
  value.write("VP8X", 12, "ascii");
  return value;
}

/**
 * 업로드 파일 입력
 */
function upload(buffer: Buffer, mimetype: string): PosterUploadFile {
  return { buffer, mimetype, size: buffer.byteLength };
}

// 포스터 파일 저장소
describe("PosterService", () => {
  // 테스트가 만든 임시 디렉터리
  const directories: string[] = [];

  // 임시 디렉터리 삭제
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  // 임시 디렉터리를 저장소로 쓰는 서비스
  async function service(): Promise<{ service: PosterService; directory: string }> {
    const directory = await mkdtemp(join(tmpdir(), "npr-poster-"));
    directories.push(directory);
    return {
      directory,
      service: new PosterService({ posterStorageDir: directory } as AppEnvironment),
    };
  }

  // 매니페스트를 원자적으로 교체하고 내용 주소 기반 이미지는 유지
  it("atomically switches the manifest while retaining immutable content-addressed assets", async () => {
    const fixture = await service();
    expect(await fixture.service.current()).toEqual({ poster: null });

    const first = await fixture.service.upload(upload(png(), "image/png"), "poster-key-one");
    const second = await fixture.service.upload(upload(jpeg(), "image/jpeg"), "poster-key-two");

    expect(first).toMatchObject({ poster: { mediaType: "image/png", sizeBytes: 24 } });
    expect(second).toMatchObject({ poster: { mediaType: "image/jpeg", sizeBytes: 10 } });
    expect(first.poster.version).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.poster.version).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.poster.imageUrl).toBe(`/api/v1/public/poster/image/${first.poster.version}`);
    expect(Object.keys(first.poster).sort()).toEqual([
      "imageUrl", "mediaType", "sizeBytes", "updatedAt", "version",
    ].sort());
    expect((await fixture.service.current()).poster).toEqual(second.poster);
    await expect(fixture.service.asset(first.poster.version)).resolves.toMatchObject({ mediaType: "image/png" });
    await expect(fixture.service.asset(second.poster.version)).resolves.toMatchObject({ mediaType: "image/jpeg" });

    const manifest = JSON.parse(await readFile(join(fixture.directory, "current.json"), "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({ schemaVersion: 1, version: second.poster.version });
    expect(manifest).not.toHaveProperty("imageUrl", expect.stringContaining("tmp"));
    expect(await readdir(join(fixture.directory, "assets"))).toHaveLength(2);
  });

  // 같은 키 재요청은 파일 기반 멱등 결과를 재생하고 이전 포스터를 다시 활성화하지 않음
  it("replays the same file-backed idempotency result without reactivating an older poster", async () => {
    const fixture = await service();
    const first = await fixture.service.upload(upload(png(), "image/png"), "poster-replay-key");
    const second = await fixture.service.upload(upload(webp(), "image/webp"), "poster-newer-key");
    const replay = await fixture.service.upload(upload(png(), "image/png"), "poster-replay-key");

    expect(replay).toEqual({ poster: first.poster });
    expect((await fixture.service.current()).poster).toEqual(second.poster);
    await expect(fixture.service.upload(upload(jpeg(), "image/jpeg"), "poster-replay-key"))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  // 지원하지 않는 형식, 서명 불일치, 크기 초과 거부
  it("rejects unsupported, mismatched, and oversized raster declarations", async () => {
    const fixture = await service();
    await expect(fixture.service.upload(upload(png(), "image/svg+xml"), "poster-svg-key"))
      .rejects.toMatchObject({ status: 415, code: "POSTER_MEDIA_TYPE_INVALID" });
    await expect(fixture.service.upload(upload(png(), "image/jpeg"), "poster-mismatch-key"))
      .rejects.toMatchObject({ status: 415, code: "POSTER_SIGNATURE_INVALID" });
    await expect(fixture.service.upload({ buffer: png(), mimetype: "image/png", size: POSTER_MAX_BYTES + 1 }, "poster-large-key"))
      .rejects.toMatchObject({ status: 413, code: "POSTER_SIZE_INVALID" });
  });

  // 강한 버전 ETag와 조건부 요청 처리
  it("uses a strong version ETag and honors conditional immutable asset requests", async () => {
    const fixture = await service();
    const uploaded = await fixture.service.upload(upload(webp(), "image/webp"), "poster-cache-key");
    const asset = await fixture.service.asset(uploaded.poster.version);

    expect(asset.etag).toMatch(/^"sha256-[a-f0-9]{64}"$/u);
    expect(fixture.service.isNotModified(asset.etag, undefined, asset)).toBe(true);
    expect(fixture.service.isNotModified(`W/${asset.etag}`, undefined, asset)).toBe(true);
    expect(fixture.service.isNotModified(undefined, asset.lastModified.toUTCString(), asset)).toBe(true);
    expect(fixture.service.isNotModified('"sha256-unrelated"', undefined, asset)).toBe(false);
  });

  // 활성 포스터 파일 누락은 저장소 손상, 버전 직접 요청은 404 유지
  it("reports a missing active asset as storage corruption while preserving direct asset 404 semantics", async () => {
    const fixture = await service();
    const uploaded = await fixture.service.upload(upload(png(), "image/png"), "poster-missing-asset-key");
    await unlink(join(fixture.directory, "assets", `${uploaded.poster.version}.png`));

    await expect(fixture.service.current())
      .rejects.toMatchObject({ status: 503, code: "POSTER_STORAGE_CORRUPT" });
    await expect(fixture.service.asset(uploaded.poster.version))
      .rejects.toMatchObject({ status: 404, code: "POSTER_ASSET_NOT_FOUND" });
  });
});
