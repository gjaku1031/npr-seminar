import type { NextConfig } from "next";

/**
 * 정적 HTML을 S3/CloudFront에서 제공하고 API는 같은 출처의 `/api/v1` 원본으로 보냄
 */
const nextConfig: NextConfig = {
  // 정적 HTML 내보내기
  output: "export",
  // 경로마다 디렉터리/index.html 로 생성
  trailingSlash: true,
  // 정적 호스팅이라 이미지 최적화 서버를 쓰지 않음
  images: { unoptimized: true },
};

export default nextConfig;
