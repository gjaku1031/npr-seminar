import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";

export const POSTER_MAX_BYTES = 10 * 1024 * 1024;

export type PosterContentType = "image/png" | "image/jpeg" | "image/webp";

export interface PosterUploadFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
}

export interface PosterDescriptor {
  readonly version: string;
  readonly imageUrl: string;
  readonly mediaType: PosterContentType;
  readonly sizeBytes: number;
  readonly updatedAt: string;
}

export interface PosterAsset {
  readonly path: string;
  readonly mediaType: PosterContentType;
  readonly sizeBytes: number;
  readonly etag: string;
  readonly lastModified: Date;
}

interface PosterManifest {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly mediaType: PosterContentType;
  readonly sizeBytes: number;
  readonly updatedAt: string;
}

interface PosterIdempotencyRecord {
  readonly schemaVersion: 1;
  readonly keyDigest: string;
  readonly contentHash: string;
  readonly descriptor: PosterDescriptor;
}

const VERSION_PATTERN = /^[a-f0-9]{64}$/u;
const MIME_EXTENSION: Readonly<Record<PosterContentType, "png" | "jpg" | "webp">> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

@Injectable()
export class PosterService {
  private operationTail: Promise<void> = Promise.resolve();

  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public async upload(file: PosterUploadFile | undefined, idempotencyKey: string) {
    if (file === undefined) throw new DomainError(400, "POSTER_REQUIRED", "The poster file is required.");
    const mediaType = this.validateFile(file);
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const version = contentHash;
    const keyDigest = createHash("sha256").update(`POSTER_UPLOAD\u0000${idempotencyKey}`).digest("hex");

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

  private signatureMatches(mediaType: PosterContentType, value: Buffer): boolean {
    if (mediaType === "image/png") return this.isPng(value);
    if (mediaType === "image/jpeg") return this.isJpeg(value);
    return this.isWebp(value);
  }

  private isPng(value: Buffer): boolean {
    return value.length >= 24
      && value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && value.subarray(12, 16).toString("ascii") === "IHDR";
  }

  private isJpeg(value: Buffer): boolean {
    return value.length >= 4 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff
      && value[3] !== 0x00 && value[3] !== 0xff;
  }

  private isWebp(value: Buffer): boolean {
    if (value.length < 16 || value.subarray(0, 4).toString("ascii") !== "RIFF"
      || value.subarray(8, 12).toString("ascii") !== "WEBP") return false;
    return ["VP8 ", "VP8L", "VP8X"].includes(value.subarray(12, 16).toString("ascii"));
  }

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

  private storageRoot(): string {
    if (this.environment.posterStorageDir === undefined) {
      throw new DomainError(503, "POSTER_STORAGE_NOT_CONFIGURED", "Poster storage is not configured.");
    }
    return this.environment.posterStorageDir;
  }

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

  private async syncDirectory(path: string): Promise<void> {
    const handle = await open(path, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(operation).finally(release);
  }

  private assetFileName(version: string, mediaType: PosterContentType): string {
    return `${version}.${MIME_EXTENSION[mediaType]}`;
  }

  private isContentType(value: string): value is PosterContentType {
    return value === "image/png" || value === "image/jpeg" || value === "image/webp";
  }

  private validDescriptor(value: unknown): value is PosterDescriptor {
    return this.isRecord(value) && typeof value.version === "string" && VERSION_PATTERN.test(value.version)
      && typeof value.imageUrl === "string" && value.imageUrl === `/api/v1/public/poster/image/${value.version}`
      && typeof value.mediaType === "string" && this.isContentType(value.mediaType)
      && typeof value.sizeBytes === "number" && Number.isInteger(value.sizeBytes)
      && value.sizeBytes > 0 && value.sizeBytes <= POSTER_MAX_BYTES
      && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  }
}
