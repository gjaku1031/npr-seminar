import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";

/**
 * 포스터 파일 최대 크기(바이트). 10 MiB
 */
export const POSTER_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 허용 포스터 미디어 타입
 */
export type PosterContentType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Multer가 메모리에 받은 업로드 파일
 */
export interface PosterUploadFile {
  /**
   * 파일 내용
   */
  readonly buffer: Buffer;

  /**
   * 클라이언트가 선언한 미디어 타입. 서명으로 다시 확인함
   */
  readonly mimetype: string;

  /**
   * 선언 크기(바이트)
   */
  readonly size: number;
}

/**
 * 공개 포스터 정보
 */
export interface PosterDescriptor {
  /**
   * 버전. 이미지 SHA-256 hex
   */
  readonly version: string;

  /**
   * 이미지 경로. 버전을 포함한 같은 출처 URL
   */
  readonly imageUrl: string;

  /**
   * 미디어 타입
   */
  readonly mediaType: PosterContentType;

  /**
   * 크기(바이트)
   */
  readonly sizeBytes: number;

  /**
   * 파일 수정 시각(ISO 8601)
   */
  readonly updatedAt: string;
}

/**
 * 전송할 포스터 파일 정보
 */
export interface PosterAsset {
  /**
   * 디스크 절대 경로
   */
  readonly path: string;

  /**
   * 미디어 타입
   */
  readonly mediaType: PosterContentType;

  /**
   * 크기(바이트)
   */
  readonly sizeBytes: number;

  /**
   * 강한 ETag. `"sha256-{버전}"`
   */
  readonly etag: string;

  /**
   * 파일 수정 시각
   */
  readonly lastModified: Date;
}

/**
 * 현재 포스터를 가리키는 current.json 형식
 */
interface PosterManifest {
  /**
   * 형식 버전
   */
  readonly schemaVersion: 1;

  /**
   * 현재 포스터 버전
   */
  readonly version: string;

  /**
   * 미디어 타입
   */
  readonly mediaType: PosterContentType;

  /**
   * 크기(바이트)
   */
  readonly sizeBytes: number;

  /**
   * 파일 수정 시각(ISO 8601). 실제 파일과 대조해 손상 판단
   */
  readonly updatedAt: string;
}

/**
 * 업로드 멱등 기록 파일 형식
 */
interface PosterIdempotencyRecord {
  /**
   * 형식 버전
   */
  readonly schemaVersion: 1;

  /**
   * Idempotency-Key 다이제스트(hex)
   */
  readonly keyDigest: string;

  /**
   * 업로드 내용 SHA-256(hex). 같은 키의 다른 파일 판별
   */
  readonly contentHash: string;

  /**
   * 재생할 응답
   */
  readonly descriptor: PosterDescriptor;
}

/**
 * 버전 형식. SHA-256 hex 64자
 */
const VERSION_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * 미디어 타입별 저장 확장자
 */
const MIME_EXTENSION: Readonly<Record<PosterContentType, "png" | "jpg" | "webp">> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * 포스터 파일 저장소
 *
 * DB 없이 POSTER_STORAGE_DIR에 저장
 * - assets/{sha256}.{확장자}: 내용 주소 기반 불변 이미지
 * - current.json: 현재 포스터 매니페스트
 * - idempotency/{키 다이제스트}.json: 업로드 멱등 기록
 * 쓰기는 프로세스 안에서 직렬화하고, 임시 파일 fsync 후 rename으로 원자적 교체
 */
@Injectable()
export class PosterService {
  /**
   * 직렬화 큐의 마지막 작업. 업로드끼리 순서대로 실행되게 함
   */
  private operationTail: Promise<void> = Promise.resolve();

  /**
   * 실행 환경 주입. 저장 디렉터리를 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * 포스터 업로드와 현재 포스터 교체
   *
   * 1. 크기·미디어 타입·파일 서명 검증, 내용 해시를 버전으로 사용
   * 2. 직렬화 구간에서 멱등 기록이 있으면 같은 내용일 때만 재생
   * 3. 불변 이미지 저장(이미 있으면 해시 대조) 후 매니페스트 교체
   * 4. 매니페스트 교체 뒤에 멱등 기록 저장. 중간 실패 시 같은 키 재시도가 처음부터 다시 수행됨
   *
   * @returns 새 포스터 정보
   * @throws {DomainError} 400 파일 없음, 413 크기, 415 형식·서명, 409 키 재사용, 503 저장소 오류
   */
  public async upload(file: PosterUploadFile | undefined, idempotencyKey: string) {
    if (file === undefined) throw new DomainError(400, "POSTER_REQUIRED", "The poster file is required.");
    const mediaType = this.validateFile(file);
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const version = contentHash;
    const keyDigest = createHash("sha256").update(`POSTER_UPLOAD\u0000${idempotencyKey}`).digest("hex");

    // 직렬화 구간: 멱등 기록 확인, 같은 키는 같은 내용일 때만 재생
    return this.exclusive(async () => {
      const paths = await this.ensureStorage();
      const recordPath = join(paths.idempotency, `${keyDigest}.json`);
      const replay = await this.readIdempotencyRecord(recordPath);
      if (replay !== null) {
        if (replay.contentHash !== contentHash) {
          throw new DomainError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was used for another poster.");
        }
        return { poster: replay.descriptor };
      }

      // 불변 이미지 저장 후 응답·매니페스트 조립
      const assetPath = join(paths.assets, this.assetFileName(version, mediaType));
      const assetStat = await this.persistAsset(assetPath, file.buffer, contentHash);
      const descriptor: PosterDescriptor = {
        version,
        imageUrl: `/api/v1/public/poster/image/${version}`,
        mediaType,
        sizeBytes: file.buffer.byteLength,
        updatedAt: assetStat.mtime.toISOString(),
      };
      const manifest: PosterManifest = {
        schemaVersion: 1,
        version: descriptor.version,
        mediaType: descriptor.mediaType,
        sizeBytes: descriptor.sizeBytes,
        updatedAt: descriptor.updatedAt,
      };
      // 매니페스트 교체 후 멱등 기록 저장. 순서를 바꾸면 반영되지 않은 업로드가 재생될 수 있음
      await this.atomicWriteJson(paths.manifest, manifest, 0o640);
      await this.atomicWriteJson(recordPath, {
        schemaVersion: 1,
        keyDigest,
        contentHash,
        descriptor,
      } satisfies PosterIdempotencyRecord, 0o640);
      return { poster: descriptor };
    });
  }

  /**
   * 현재 포스터 정보
   *
   * 매니페스트와 실제 파일의 형식·크기·수정 시각이 다르면 손상으로 판단
   *
   * @returns 포스터 정보. 등록된 포스터가 없으면 null
   * @throws {DomainError} 503 매니페스트가 가리키는 파일 없음·불일치
   */
  public async current(): Promise<{ poster: PosterDescriptor | null }> {
    const root = this.storageRoot();
    const manifest = await this.readManifest(join(root, "current.json"));
    if (manifest === null) return { poster: null };
    const asset = await this.asset(manifest.version).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "POSTER_ASSET_NOT_FOUND") {
        throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The active poster asset is missing.");
      }
      throw error;
    });
    if (asset.mediaType !== manifest.mediaType || asset.sizeBytes !== manifest.sizeBytes
      || asset.lastModified.toISOString() !== manifest.updatedAt) {
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The active poster manifest is inconsistent.");
    }
    return {
      poster: {
        version: manifest.version,
        imageUrl: `/api/v1/public/poster/image/${manifest.version}`,
        mediaType: manifest.mediaType,
        sizeBytes: manifest.sizeBytes,
        updatedAt: manifest.updatedAt,
      },
    };
  }

  /**
   * 버전에 해당하는 이미지 파일 탐색
   *
   * 확장자별 후보 중 정확히 하나의 일반 파일이어야 함. 심볼릭 링크·크기 범위 밖은 손상
   *
   * @throws {DomainError} 404 버전 형식 오류·파일 없음, 503 손상·중복
   */
  public async asset(version: string): Promise<PosterAsset> {
    if (!VERSION_PATTERN.test(version)) {
      throw new DomainError(404, "POSTER_ASSET_NOT_FOUND", "The poster asset was not found.");
    }
    const assetsRoot = join(this.storageRoot(), "assets");
    const candidates: Array<{
      path: string;
      mediaType: PosterContentType;
      sizeBytes: number;
      lastModified: Date;
    }> = [];
    // 확장자별 후보 수집. 없는 파일은 건너뛰고 비정상 파일은 손상으로 중단
    for (const mediaType of Object.keys(MIME_EXTENSION) as PosterContentType[]) {
      const path = join(assetsRoot, this.assetFileName(version, mediaType));
      try {
        const metadata = await lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink()
          || metadata.size < 1 || metadata.size > POSTER_MAX_BYTES) {
          throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The poster asset is invalid.");
        }
        candidates.push({ path, mediaType, sizeBytes: metadata.size, lastModified: metadata.mtime });
      } catch (error) {
        if (this.errorCode(error) !== "ENOENT") throw error;
      }
    }
    // 후보가 없으면 404, 같은 버전이 여러 확장자로 있으면 손상
    if (candidates.length === 0) {
      throw new DomainError(404, "POSTER_ASSET_NOT_FOUND", "The poster asset was not found.");
    }
    if (candidates.length !== 1) {
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The poster version resolves to multiple assets.");
    }
    const { path, mediaType, sizeBytes, lastModified } = candidates[0]!;
    return {
      path,
      mediaType,
      sizeBytes,
      etag: `"sha256-${version}"`,
      lastModified,
    };
  }

  /**
   * 조건부 요청의 304 응답 여부
   *
   * If-None-Match가 있으면 그것만 판단(약한 비교, `*` 허용). 없을 때만 If-Modified-Since를 초 단위로 비교
   */
  public isNotModified(ifNoneMatch: string | undefined, ifModifiedSince: string | undefined, asset: PosterAsset): boolean {
    if (ifNoneMatch !== undefined) {
      return ifNoneMatch.split(",").some((value) => {
        const candidate = value.trim();
        return candidate === "*" || candidate === asset.etag || candidate === `W/${asset.etag}`;
      });
    }
    if (ifModifiedSince === undefined) return false;
    const since = Date.parse(ifModifiedSince);
    return Number.isFinite(since) && Math.floor(asset.lastModified.getTime() / 1_000) * 1_000 <= since;
  }

  /**
   * 업로드 파일 크기·미디어 타입·서명 검증
   *
   * @returns 확인된 미디어 타입
   * @throws {DomainError} 413 크기 범위 밖, 415 허용 외 형식·서명 불일치
   */
  private validateFile(file: PosterUploadFile): PosterContentType {
    if (!Buffer.isBuffer(file.buffer) || file.size !== file.buffer.byteLength
      || file.size < 1 || file.size > POSTER_MAX_BYTES) {
      throw new DomainError(413, "POSTER_SIZE_INVALID", "The poster must be between 1 byte and 10 MiB.");
    }
    if (file.mimetype !== "image/png" && file.mimetype !== "image/jpeg" && file.mimetype !== "image/webp") {
      throw new DomainError(415, "POSTER_MEDIA_TYPE_INVALID", "Only PNG, JPEG, and WebP posters are accepted.");
    }
    if (!this.signatureMatches(file.mimetype, file.buffer)) {
      throw new DomainError(415, "POSTER_SIGNATURE_INVALID", "The poster signature does not match its media type.");
    }
    return file.mimetype;
  }

  /**
   * 미디어 타입과 파일 서명 일치 여부
   */
  private signatureMatches(mediaType: PosterContentType, value: Buffer): boolean {
    if (mediaType === "image/png") return this.isPng(value);
    if (mediaType === "image/jpeg") return this.isJpeg(value);
    return this.isWebp(value);
  }

  /**
   * PNG 서명과 첫 IHDR 청크 확인
   */
  private isPng(value: Buffer): boolean {
    return value.length >= 24
      && value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && value.subarray(12, 16).toString("ascii") === "IHDR";
  }

  /**
   * JPEG SOI와 마커 시작 바이트 확인
   */
  private isJpeg(value: Buffer): boolean {
    return value.length >= 4 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff
      && value[3] !== 0x00 && value[3] !== 0xff;
  }

  /**
   * RIFF·WEBP 헤더와 VP8 계열 청크 확인
   */
  private isWebp(value: Buffer): boolean {
    if (value.length < 16 || value.subarray(0, 4).toString("ascii") !== "RIFF"
      || value.subarray(8, 12).toString("ascii") !== "WEBP") return false;
    return ["VP8 ", "VP8L", "VP8X"].includes(value.subarray(12, 16).toString("ascii"));
  }

  /**
   * 저장 디렉터리 생성(권한 0750)
   *
   * @returns 루트·이미지·멱등 기록 디렉터리와 매니페스트 경로
   */
  private async ensureStorage() {
    const root = this.storageRoot();
    const assets = join(root, "assets");
    const idempotency = join(root, "idempotency");
    await mkdir(root, { recursive: true, mode: 0o750 });
    await Promise.all([
      mkdir(assets, { recursive: true, mode: 0o750 }),
      mkdir(idempotency, { recursive: true, mode: 0o750 }),
    ]);
    return { root, assets, idempotency, manifest: join(root, "current.json") };
  }

  /**
   * 저장 루트 경로
   *
   * @throws {DomainError} 503 POSTER_STORAGE_NOT_CONFIGURED
   */
  private storageRoot(): string {
    if (this.environment.posterStorageDir === undefined) {
      throw new DomainError(503, "POSTER_STORAGE_NOT_CONFIGURED", "Poster storage is not configured.");
    }
    return this.environment.posterStorageDir;
  }

  /**
   * 불변 이미지 파일 저장
   *
   * 배타 생성(wx) 후 fsync, 디렉터리 fsync. 같은 버전 파일이 이미 있으면 내용 해시가 같아야 함
   *
   * @returns 저장된 파일 메타데이터
   * @throws {DomainError} 503 기존 파일 불일치·저장 결과 이상
   */
  private async persistAsset(path: string, value: Buffer, expectedHash: string) {
    try {
      const handle = await open(path, "wx", 0o640);
      try {
        await handle.writeFile(value);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.syncDirectory(dirname(path));
    } catch (error) {
      // 같은 버전 파일이 이미 있으면 덮어쓰지 않고 내용 일치만 확인
      if (this.errorCode(error) !== "EEXIST") throw error;
      const existing = await readFile(path);
      if (existing.byteLength !== value.byteLength
        || createHash("sha256").update(existing).digest("hex") !== expectedHash) {
        throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "An immutable poster asset is inconsistent.");
      }
    }
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size !== value.byteLength) {
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The poster asset was not persisted safely.");
    }
    return metadata;
  }

  /**
   * 현재 포스터 매니페스트 읽기
   *
   * @returns 매니페스트. 파일이 없으면 null
   * @throws {DomainError} 503 형식 오류
   */
  private async readManifest(path: string): Promise<PosterManifest | null> {
    const value = await this.readJson(path);
    if (value === null) return null;
    if (!this.isRecord(value) || value.schemaVersion !== 1 || typeof value.version !== "string"
      || typeof value.mediaType !== "string" || typeof value.sizeBytes !== "number"
      || !Number.isInteger(value.sizeBytes) || typeof value.updatedAt !== "string"
      || !VERSION_PATTERN.test(value.version) || !this.isContentType(value.mediaType)
      || value.sizeBytes < 1 || value.sizeBytes > POSTER_MAX_BYTES
      || !Number.isFinite(Date.parse(value.updatedAt))) {
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "The active poster manifest is invalid.");
    }
    return value as unknown as PosterManifest;
  }

  /**
   * 업로드 멱등 기록 읽기
   *
   * @returns 기록. 파일이 없으면 null
   * @throws {DomainError} 503 형식 오류
   */
  private async readIdempotencyRecord(path: string): Promise<PosterIdempotencyRecord | null> {
    const value = await this.readJson(path);
    if (value === null) return null;
    const descriptor = this.isRecord(value) ? value.descriptor : null;
    if (!this.isRecord(value) || value.schemaVersion !== 1 || typeof value.keyDigest !== "string"
      || typeof value.contentHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.keyDigest)
      || !/^[a-f0-9]{64}$/u.test(value.contentHash) || !this.validDescriptor(descriptor)) {
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "A poster idempotency record is invalid.");
    }
    return value as unknown as PosterIdempotencyRecord;
  }

  /**
   * 16 KiB 이하 일반 JSON 파일 읽기
   *
   * @returns 파싱 결과. 파일이 없으면 null
   * @throws {DomainError} 503 심볼릭 링크·크기 초과·읽기·파싱 실패
   */
  private async readJson(path: string): Promise<unknown | null> {
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024) {
        throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "A poster metadata file is invalid.");
      }
      return JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch (error) {
      if (this.errorCode(error) === "ENOENT") return null;
      if (error instanceof DomainError) throw error;
      throw new DomainError(503, "POSTER_STORAGE_CORRUPT", "Poster metadata could not be read.");
    }
  }

  /**
   * JSON 파일 원자적 교체
   *
   * 같은 디렉터리 임시 파일에 쓰고 fsync 후 rename, 디렉터리 fsync
   * rename 전에 실패하면 임시 파일 삭제
   *
   * @param mode 새 파일 권한
   */
  private async atomicWriteJson(path: string, value: unknown, mode: number): Promise<void> {
    const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
    let created = false;
    try {
      const handle = await open(temporary, "wx", mode);
      created = true;
      try {
        await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
      created = false;
      await this.syncDirectory(dirname(path));
    } finally {
      if (created) await unlink(temporary).catch(() => undefined);
    }
  }

  /**
   * rename 결과를 디스크에 확정하기 위한 디렉터리 fsync
   */
  private async syncDirectory(path: string): Promise<void> {
    const handle = await open(path, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  }

  /**
   * 프로세스 안 쓰기 작업 직렬화
   *
   * 앞선 작업이 실패해도 다음 작업은 실행됨. 여러 프로세스 간 잠금은 아님
   */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  /**
   * 버전과 미디어 타입에 따른 이미지 파일명
   */
  private assetFileName(version: string, mediaType: PosterContentType): string {
    return `${version}.${MIME_EXTENSION[mediaType]}`;
  }

  /**
   * 허용 미디어 타입 여부
   */
  private isContentType(value: string): value is PosterContentType {
    return value === "image/png" || value === "image/jpeg" || value === "image/webp";
  }

  /**
   * 멱등 기록 속 포스터 정보 형식 확인
   */
  private validDescriptor(value: unknown): value is PosterDescriptor {
    return this.isRecord(value) && typeof value.version === "string" && VERSION_PATTERN.test(value.version)
      && typeof value.imageUrl === "string" && value.imageUrl === `/api/v1/public/poster/image/${value.version}`
      && typeof value.mediaType === "string" && this.isContentType(value.mediaType)
      && typeof value.sizeBytes === "number" && Number.isInteger(value.sizeBytes)
      && value.sizeBytes > 0 && value.sizeBytes <= POSTER_MAX_BYTES
      && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt));
  }

  /**
   * 배열이 아닌 객체 여부
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Node.js 시스템 오류 코드 추출
   *
   * @returns ENOENT 등 오류 코드. 없으면 undefined
   */
  private errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  }
}
