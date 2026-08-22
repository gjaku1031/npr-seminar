import type { NextConfig } from "next";

/** 정적 HTML을 S3/CloudFront에서 제공하고 API는 같은 출처의 `/api/v1` 원본으로 보낸다. */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
