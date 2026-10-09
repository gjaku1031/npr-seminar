// QR 텍스트에서 토큰 추출
// 받아들이는 형태(우선순위 순)
// 1. `/booking/{familyBookingId}#qr={token}`: 현재 발급 형태. 토큰은 프래그먼트에만 있음
// 2. `/q/{token}`·`/verify/{token}`: 이전 URL 형태
// 3. 원문 토큰 그대로: 이전 QR
// 추출한 토큰은 서버로 보내기만 하고 저장·로깅하지 않음
// 관리자 체크인과 스캐너가 함께 쓰는 순수 함수이고 같은 레이어 슬라이스끼리는 import할 수 없어 shared에 둠

/**
 * 경로 조각 URL 디코딩. 실패하면 원문
 */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * 경로의 마지막 `verify`·`q` 다음 조각을 토큰으로 추출
 *
 * @returns 토큰. 없으면 빈 문자열
 */
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

/**
 * 스캔한 QR 텍스트에서 토큰 추출
 *
 * URL로 해석되면 경로에서 찾고, 경로 형태가 아니면 텍스트 전체를 토큰으로 간주
 * 현재 형태(`#qr=`)는 경로 토큰이 없어 텍스트 전체가 반환되고 서버가 해석
 *
 * @returns 토큰. 빈 입력이면 빈 문자열
 */
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
