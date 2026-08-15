"use client";

/**
 * 공개 진입면 (루트 `/`) — **포스터 우선**.
 *
 * 업로드된 포스터는 가변 비율 이미지다: `object-fit: contain` + 자연 비율로 **전체**를 보여 주며,
 * 절대 자르거나(crop) 배경으로 깔거나 그 위에 HTML 텍스트를 얹지 않는다. 상단 브랜드/제목 헤더는
 * 두지 않는다 — 진입면은 **포스터와 하단 액션만** 담아 포스터의 세로 존재감을 최대한 키운다. 폭·높이
 * 메타데이터가 없으므로 반응형 네이티브 이미지로 자연 크기를 지키고 가로 넘침을 막는다.
 *
 * 예약 플로우 자체는 `/reserve` 로 옮겨졌다(이 화면은 진입·안내만 한다). 하단 액션:
 * - 1차 `설명회 예약하기` → `/reserve`
 * - 2차 `이미 예약했나요? 예약 조회 · 변경 · 취소` → `/reserve?mode=manage` (기존 관리 플로우)
 *
 * 상태: 불러오는 중 · 없음(200/null) · 오류(네트워크/5xx/깨진 메타데이터) · 이미지 로드 실패를
 * 각각 정직하게 구분하고 오류/실패에는 재시도를 준다.
 */

import Link from "next/link";
import { useState } from "react";
import { Icons } from "@/shared/ui";
import { usePublicPoster } from "@/features/public-poster";

/** 고정 대체 텍스트 — 어떤 포스터든 같은 값(개인정보·회차 정보를 담지 않는다). */
const POSTER_ALT = "설명회 안내 포스터";
const DEFAULT_POSTER_IMAGE_URL = "/posters/default-admission-poster-v2.png";

/** 앱 뷰포트 폭 — ReserveView(480)와 같은 절제된 최대폭. 데스크톱에서도 가운데 정렬. */
const APP_MAX_WIDTH = 480;

/** 상태 카드(불러오는 중·없음·오류·이미지 실패) 공용 컨테이너. */
const PANEL_STYLE = {
  padding: "22px 20px",
  borderRadius: "var(--radius-lg)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-hairline)",
  boxShadow: "var(--shadow-card)",
} as const;

const RETRY_BUTTON_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  marginTop: 14,
  padding: "9px 16px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  color: "var(--text-body)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
} as const;

export function PosterEntranceView() {
  const { state, reload } = usePublicPoster();

  return (
    <div
      data-screen-label="공개 진입 — 포스터"
      style={{
        maxWidth: APP_MAX_WIDTH,
        margin: "0 auto",
        // 동적 뷰포트 높이에 정확히 고정 — iOS Safari 주소창 개폐(dvh)까지 반영해 페이지 세로 스크롤을 없앤다.
        height: "100dvh",
        overflow: "hidden",
        background: "var(--surface-page)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 상단 헤더 없음 — 포스터가 곧바로 뷰포트 맨 위에서 세로로 최대한 크게 펼쳐진다. */}
      {/* minHeight:0 이 없으면 flex 자식이 min-content(=포스터 자연 높이) 아래로 못 줄어 스크롤이 생긴다. */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "12px 12px",
        }}
      >
        {state.status === "pending" && <PendingPanel />}
        {state.status === "empty" && (
          <PosterImage key="default-poster" imageUrl={DEFAULT_POSTER_IMAGE_URL} />
        )}
        {state.status === "error" && <ErrorPanel message={state.message} onRetry={reload} />}
        {state.status === "ready" && (
          <PosterImage key={state.descriptor.version} imageUrl={state.descriptor.imageUrl} />
        )}
      </main>

      <ActionRegion />
    </div>
  );
}

/** 포스터 이미지 — 자연 비율 반응형 네이티브 이미지. 로드/디코드 실패는 별도 상태 + 재시도. */
function PosterImage({ imageUrl }: { imageUrl: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  if (status === "failed") {
    return (
      <div style={PANEL_STYLE}>
        <p role="alert" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "var(--status-danger)" }}>
          <span style={{ color: "var(--status-danger)", display: "inline-flex" }}>
            <Icons.image size={17} />
          </span>
          포스터 이미지를 불러오지 못했습니다.
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          연결 상태를 확인한 뒤 다시 시도해 주세요. 아래 버튼으로 바로 예약하실 수도 있습니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
          style={RETRY_BUTTON_STYLE}
        >
          <Icons.refresh size={14} /> 다시 시도
        </button>
      </div>
    );
  }

  return (
    <>
      {status === "loading" && (
        <div style={PANEL_STYLE}>
          <p role="status" aria-live="polite" style={{ margin: 0, textAlign: "center", fontSize: 13, color: "var(--text-faint)" }}>
            설명회 안내 포스터를 불러오는 중입니다.
          </p>
        </div>
      )}
      {/* 폭·높이 메타데이터가 없어 next/image 대신 반응형 네이티브 이미지를 쓴다. 검증된 same-origin URL 만 온다. */}
      {/*
        가용 높이·폭 안에서 자연 비율을 유지하며 축소만 한다:
        max-*:100% 는 정의된 높이를 가진 flex 부모(main) 기준으로 해석되고, width/height:auto 로
        이미지 상자가 실제 이미지 크기에 밀착(shrink-wrap)해 테두리가 여백 없이 감싼다. 절대 crop/왜곡 없음.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        src={imageUrl}
        alt={POSTER_ALT}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        style={{
          display: status === "loaded" ? "block" : "none",
          alignSelf: "center",
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-hairline)",
          background: "var(--surface-card)",
          boxShadow: "var(--shadow-card)",
        }}
      />
    </>
  );
}

function PendingPanel() {
  return (
    <div style={PANEL_STYLE}>
      <p role="status" aria-live="polite" style={{ margin: 0, textAlign: "center", fontSize: 13.5, color: "var(--text-faint)" }}>
        설명회 안내 포스터를 불러오는 중입니다.
      </p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={PANEL_STYLE}>
      <p role="alert" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "var(--status-danger)" }}>
        <span style={{ display: "inline-flex" }}>
          <Icons.alertTriangle size={17} />
        </span>
        안내 포스터를 불러오지 못했습니다.
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{message}</p>
      <button type="button" onClick={onRetry} style={RETRY_BUTTON_STYLE}>
        <Icons.refresh size={14} /> 다시 불러오기
      </button>
    </div>
  );
}

/** 하단 safe-area 인지 액션 영역 — overflow-hidden 100dvh flex 루트 안에서 정상 흐름의 비축소 행으로 고정한다. */
function ActionRegion() {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 18px calc(16px + env(safe-area-inset-bottom))",
        background: "rgba(247,249,242,0.92)",
        backdropFilter: "var(--blur-veil)",
        borderTop: "1px solid var(--border-hairline)",
      }}
    >
      <Link
        href="/reserve"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 54,
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))",
          color: "var(--text-on-brand)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        설명회 예약하기
        <Icons.arrowRight size={18} />
      </Link>
      <Link
        href="/reserve?mode=manage"
        style={{
          display: "block",
          textAlign: "center",
          padding: 8,
          color: "var(--violet-800)",
          fontWeight: 700,
          fontSize: 13.5,
          textDecoration: "underline",
          textUnderlineOffset: 3,
          fontFamily: "var(--font-body)",
        }}
      >
        이미 예약했나요? 예약 조회 · 변경 · 취소
      </Link>
    </div>
  );
}
