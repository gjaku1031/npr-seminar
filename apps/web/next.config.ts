import type { NextConfig } from "next";

/**
 * 스캐너 화면은 브라우저에서 same-origin `/api/v1` 로만 Nest API 를 부른다
 * (계약이 Origin·same-origin 검사를 요구하고, HttpOnly 세션 쿠키가 origin 에 묶인다).
 *
 * Nest 는 별도 앱이라 로컬·프리뷰에서는 origin 이 다르다. `NEST_API_ORIGIN` 이 있으면
 * Next 가 같은 origin 에서 프록시해 준다. 운영에서 앞단 프록시가 이미 `/api/v1` 을
 * Nest 로 보내고 있다면 이 값을 비워 두면 된다.
 */
const nestApiOrigin = process.env.NEST_API_ORIGIN;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!nestApiOrigin) return [];
    return [{ source: "/api/v1/:path*", destination: `${nestApiOrigin}/api/v1/:path*` }];
  },
};

export default nextConfig;
