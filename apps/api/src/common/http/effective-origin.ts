import type { Request } from "express";
import { isIP } from "node:net";
import type { AppEnvironment } from "../config/environment.js";

/**
 * Host 헤더 허용 형식. IPv6 대괄호 표기 또는 호스트명, 선택 포트
 */
const HOST_PATTERN = /^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::[1-9][0-9]{0,4})?$/iu;

/**
 * 요청이 실제로 도달한 출처 계산
 *
 * 1. Host 헤더가 하나뿐이고 형식이 맞는지 확인
 * 2. X-Forwarded-* 헤더는 trustProxy=1이고 루프백 프록시에서 온 경우에만 신뢰
 * 3. 신뢰하는 경우 전달 호스트·프로토콜(·클라이언트 IP)이 각각 단일 값이고 형식이 맞아야 함
 * 4. 그 외 경로에서 전달 헤더가 있으면 위조로 보고 거부
 *
 * @returns 출처 문자열. 판단할 수 없거나 의심스러우면 null
 */
export function effectiveRequestOrigin(request: Request, environment: AppEnvironment): string | null {
  const directHost = singleHeader(request.get("host"));
  if (directHost === null || !HOST_PATTERN.test(directHost)) return null;
  const forwardedHostHeader = request.get("x-forwarded-host");
  const forwardedProtoHeader = request.get("x-forwarded-proto");
  const forwardedForHeader = request.get("x-forwarded-for");
  const hasForwarded = forwardedHostHeader !== undefined || forwardedProtoHeader !== undefined || forwardedForHeader !== undefined;
  const remoteAddress = request.socket.remoteAddress ?? "";
  const trustedLoopback = environment.trustProxy === 1 && isLoopback(remoteAddress);
  // 신뢰하지 않는 경로로 들어온 전달 헤더는 위조 가능성이 있어 거부
  if (hasForwarded && !trustedLoopback) return null;
  if (trustedLoopback && hasForwarded) {
    const forwardedHost = singleHeader(forwardedHostHeader);
    const forwardedProto = singleHeader(forwardedProtoHeader);
    if (forwardedHost === null || forwardedProto === null || !HOST_PATTERN.test(forwardedHost)
      || !/^(?:https|http)$/u.test(forwardedProto)) return null;
    if (forwardedForHeader !== undefined) {
      const forwardedFor = singleHeader(forwardedForHeader);
      if (forwardedFor === null || isIP(forwardedFor) === 0) return null;
    }
    return parseOrigin(`${forwardedProto}://${forwardedHost}`);
  }
  // 신뢰 프록시가 아닌데 전달 호스트·프로토콜이 있으면 거부, 없으면 직접 연결 기준
  if (forwardedHostHeader !== undefined || forwardedProtoHeader !== undefined) return null;
  return parseOrigin(`${request.protocol}://${directHost}`);
}

/**
 * 단일 헤더 값 추출
 *
 * @returns 공백 제거 값. 없음·빈 값·쉼표로 여러 값·개행 포함이면 null
 */
function singleHeader(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized === "" || normalized.includes(",") || /[\r\n]/u.test(normalized) ? null : normalized;
}

/**
 * IPv4·IPv6·IPv4 매핑 루프백 주소 여부
 */
function isLoopback(address: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * 순수 출처 URL만 허용해 출처 문자열 반환
 *
 * @returns 자격 증명·경로·쿼리·프래그먼트가 있거나 해석 실패면 null
 */
function parseOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.username === "" && parsed.password === "" && parsed.pathname === "/"
      && parsed.search === "" && parsed.hash === "" ? parsed.origin : null;
  } catch {
    return null;
  }
}
