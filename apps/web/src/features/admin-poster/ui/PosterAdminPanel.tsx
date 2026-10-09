"use client";

/**
 * 관리자 포스터 관리 패널 — 설명회 운영 화면(`/sessions`) 하단에 얹는 콤팩트 카드(신규 라우트가 아님)
 *
 * 현재 포스터 상태를 정직하게 구분해 보여 줌: 불러오는 중 · 오류 · 없음(공개 루트가 대신 쓰는
 * 기본 포스터를 그대로 미리보기) · 있음(게시본 미리보기). 접근 가능한 파일 선택 → 로컬
 * 미리보기 → 교체 업로드를 제공함. 삭제 UI 는 없음
 *
 * 이미지 규칙: 실제 자산만 씀(브랜드 로고·서버 포스터·기본 포스터). CSS/HTML 아트·가짜 플레이스홀더 없음
 * 미리보기는 `contain` 으로 담고, object URL 은 훅이 교체·성공·언마운트에서 revoke 함
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icons } from "@/shared/ui";
import { fmtDateTime } from "@/shared/lib/format";
import { POSTER_ACCEPT_ATTR, type PosterDescriptor } from "@/shared/api";
import { useAdminPoster } from "../model/useAdminPoster";

/**
 * 등록된 포스터가 없을 때 공개 루트(`/`)가 대신 보여 주는 기본 포스터 — PosterEntranceView 와
 * 같은 자산임. 사용자가 준 포스터와 바이트 동일이라, "없음"을 빈 화면이 아니라 이걸로 보여 줌
 */
const DEFAULT_POSTER_IMAGE_URL = "/posters/default-admission-poster-v2.png";

/**
 * 패널 카드 스타일
 */
const PANEL_STYLE = {
  maxWidth: 640,
  padding: "var(--card-pad)",
  borderRadius: "var(--radius-lg)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-hairline)",
  boxShadow: "var(--shadow-card)",
} as const;

/**
 * 담아 보여 주는 미리보기 — 자기 로드 실패 상태를 가짐(깨진 이미지를 정직하게 말함)
 */
function BoundedPreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>미리보기를 불러오지 못했습니다.</p>
    );
  }
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 240,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--border-hairline)",
        background: "var(--surface-sunken)",
      }}
    >
      {/* 폭·높이 메타데이터가 없어 반응형 네이티브 이미지를 담아(contain) 보여 줌 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, objectFit: "contain" }}
      />
    </div>
  );
}

/**
 * 현재 게시 포스터의 정보 표시
 */
function CurrentPosterMeta({ descriptor }: { descriptor: PosterDescriptor }) {
  const sizeKb = Math.max(1, Math.round(descriptor.sizeBytes / 1024));
  return (
    <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12.5 }}>
      <dt style={{ color: "var(--text-muted)" }}>수정</dt>
      <dd style={{ margin: 0, color: "var(--text-body)" }}>{fmtDateTime(new Date(descriptor.updatedAt))}</dd>
      <dt style={{ color: "var(--text-muted)" }}>형식</dt>
      <dd style={{ margin: 0, color: "var(--text-body)" }}>
        {descriptor.mediaType} · {sizeKb.toLocaleString("ko-KR")} KB
      </dd>
    </dl>
  );
}

/**
 * 공개 진입면 포스터 관리 패널
 */
export function PosterAdminPanel() {
  const { meta, reload, file, previewUrl, selectFile, uploading, uploadError, successNotice, upload } = useAdminPoster();
  const inputRef = useRef<HTMLInputElement>(null);

  // 선택이 비워지면(성공·취소·검증 실패) 입력 요소도 비워 같은 파일을 다시 고를 수 있게 함
  useEffect(() => {
    if (file === null && inputRef.current) inputRef.current.value = "";
  }, [file]);

  // 게시본이 있거나(ready) 기본 포스터가 대신 보이는 중(empty)이면 화면엔 늘 포스터가 있음 —
  // 그래서 1차 버튼은 "등록"이 아니라 "교체"라고 정직하게 말할 수 있음
  const hasVisiblePoster = meta.status === "ready" || meta.status === "empty";
  const uploadLabel = useMemo(() => {
    if (uploading) return "업로드 중…";
    return hasVisiblePoster ? "포스터 교체" : "포스터 등록";
  }, [uploading, hasVisiblePoster]);

  return (
    <section aria-labelledby="poster-admin-title" style={PANEL_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 38, height: 38, borderRadius: "var(--radius-sm)", background: "var(--surface-brand-soft)", color: "var(--violet-800)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icons.image size={19} />
        </span>
        <span>
          <h2 id="poster-admin-title" style={{ fontSize: 17, fontWeight: 800, color: "var(--text-strong)" }}>
            설명회 안내 포스터
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
            공개 진입면(<code style={{ fontSize: 12 }}>/</code>)에 노출되는 포스터입니다. PNG · JPG · WebP, 10MB 이하.
          </p>
        </span>
      </div>

      {/* 현재 포스터 — 불러오는 중 · 오류 · 없음 · 있음(미리보기) */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-hairline)" }}>
        {meta.status === "pending" && (
          <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
            현재 포스터를 불러오는 중입니다.
          </p>
        )}

        {meta.status === "error" && (
          <div role="alert">
            <p style={{ margin: 0, fontSize: 13, color: "var(--status-danger)", lineHeight: 1.6 }}>
              현재 포스터를 불러오지 못했습니다. {meta.message}
            </p>
            <button
              type="button"
              onClick={reload}
              style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", color: "var(--text-body)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
            >
              <Icons.refresh size={13} /> 다시 불러오기
            </button>
          </div>
        )}

        {meta.status === "empty" && (
          <div>
            <div style={{ fontSize: 11.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 8 }}>
              기본 포스터 사용 중
            </div>
            <BoundedPreview src={DEFAULT_POSTER_IMAGE_URL} alt="기본 설명회 안내 포스터 미리보기" />
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              아직 등록한 포스터가 없어 공개 진입면(<code style={{ fontSize: 12 }}>/</code>)에는 기본 포스터가 보입니다. 아래에서 이미지를 선택해 교체할 수 있어요.
            </p>
          </div>
        )}

        {meta.status === "ready" && (
          <div>
            <div style={{ fontSize: 11.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 8 }}>
              현재 게시본
            </div>
            <BoundedPreview key={meta.descriptor.version} src={meta.descriptor.imageUrl} alt="현재 설명회 안내 포스터 미리보기" />
            <CurrentPosterMeta descriptor={meta.descriptor} />
          </div>
        )}
      </div>

      {/* 파일 선택 + 교체 업로드 */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-hairline)" }}>
        {/* 숨긴 입력은 버튼이 프로그램적으로 엶 — 탭 정지는 버튼 하나뿐(포커스 링이 보임) */}
        <input
          ref={inputRef}
          type="file"
          accept={POSTER_ACCEPT_ATTR}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          disabled={uploading}
          tabIndex={-1}
          aria-hidden="true"
          style={{ display: "none" }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-disabled={uploading}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", color: "var(--text-brand)", fontSize: 13.5, fontWeight: 700, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.58 : 1, fontFamily: "var(--font-body)" }}
          >
            <Icons.image size={15} /> {file ? "이미지 변경" : "이미지 선택"}
          </button>

          {/* 선택 상태 — 스크린리더가 낭독하도록 live 영역에 파일명을 둠 */}
          <span role="status" aria-live="polite" style={{ fontSize: 12.5, color: file ? "var(--text-body)" : "var(--text-faint)", wordBreak: "break-all" }}>
            {file ? `선택됨: ${file.name}` : "선택된 파일이 없습니다."}
          </span>
        </div>

        {file && previewUrl && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 8 }}>
              선택한 이미지
            </div>
            <BoundedPreview key={previewUrl} src={previewUrl} alt="선택한 포스터 미리보기" />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <Button size="md" onClick={upload} disabled={!file || uploading} icon={<Icons.upload size={16} />}>
            {uploadLabel}
          </Button>
          {file && !uploading && (
            <Button size="md" variant="ghost" onClick={() => selectFile(null)}>
              선택 취소
            </Button>
          )}
        </div>

        {uploadError && (
          <p role="alert" style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.5 }}>
            {uploadError}
          </p>
        )}

        {successNotice && (
          <p role="status" aria-live="polite" style={{ margin: "12px 0 0", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--status-success-soft)", color: "var(--status-success)", fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
            {successNotice}
          </p>
        )}
      </div>
    </section>
  );
}
