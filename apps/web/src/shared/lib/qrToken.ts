/**
 * QR 텍스트에서 토큰 추출 — qr-poc `ScannerClient.extractQrToken` 이식 (pinned c4194a0).
 *
 * 받아들이는 형태 (우선순위 순):
 * 1. `/booking/{familyBookingId}#qr={token}` — 현재 발급 형태. 토큰은 **프래그먼트에만** 있다.
 * 2. `/q/{token}`·`/verify/{token}` — 레거시 URL.
 * 3. 원문 토큰 그대로 — 레거시 QR.
 *
 * 추출한 토큰은 서버로 보낼 뿐 저장하지 않는다 (계약: 원문 QR 은 저장·로깅 금지).
 *
 * shared 레이어에 둔다: features/check-in(관리자)과 features/scanner-session(iPad)이
 * 함께 쓰는 순수 함수이고, 같은 레이어 슬라이스끼리는 직접 import 할 수 없다 (설계 §4.1).
 */

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractTokenFromPath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean).map(decodePathSegment);

  for (const prefix of ["verify", "q"]) {
    const index = segments.lastIndexOf(prefix);
    if (index === -1) continue;
    const token = segments[index + 1]?.trim();
    if (token) return token;
  }

  return "";
}

export function extractQrToken(decodedText: string): string {
  const text = decodedText.trim();
  if (!text) return "";

  try {
    const url = new URL(text, "https://qr.local");
    const token = extractTokenFromPath(url.pathname);
    if (token) return token;
  } catch {
    const token = extractTokenFromPath(text);
    if (token) return token;
  }

  return text;
}
