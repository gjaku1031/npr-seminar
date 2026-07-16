import "server-only";
import { serverEnv } from "../config/env";

/**
 * 문자 본문·QR에 들어가는 절대 URL 빌더 — qr-poc(src/lib/appUrls.ts) 이식.
 * BASE_URL 명시 > Vercel 배포 URL > localhost 순으로 결정한다.
 */

export function getBaseUrl(): string {
  const explicit = serverEnv().BASE_URL;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const baseUrl = explicit || (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");
  return baseUrl.replace(/\/$/, "");
}

/** 입장 QR 패스 페이지 — QR·문자 링크의 목적지 (짧아야 QR 밀도가 낮아진다) */
export function buildQrUrl(qrToken: string): string {
  return `${getBaseUrl()}/q/${encodeURIComponent(qrToken)}`;
}

/** 만족도 설문 진입 — 모바일 예약 화면의 설문 링크 (설문 URL 실호스팅 전 임시, 명세 §12) */
export function buildSurveyUrl(): string {
  return `${getBaseUrl()}/reserve`;
}
