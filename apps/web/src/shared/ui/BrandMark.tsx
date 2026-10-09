// 학원 로고 브랜드 마크
// 원본 JPG를 그대로 쓰고 정사각 프레임의 overflow: hidden으로 흰 여백만 잘라 표시
// 원본 픽셀과 로고 안의 흰색 한글 글자를 보존하기 위해 흰색을 전역 제거하지 않음
// 접근성: 의미 있는 로고면 alt(기본 학원 이름)를 낭독하고, 상위 링크가 이미 이름을 가지면 decorative로 중복 낭독 방지

import Image from "next/image";
import type { CSSProperties } from "react";
import { BRAND_LOGO_SRC, BRAND_NAME } from "./brand";

/**
 * 학원 로고 표시
 */
export function BrandMark({
  size = 28,
  radius = 9,
  alt = BRAND_NAME,
  decorative = false,
  style,
}: {
  /**
   * 정사각 프레임 한 변(px)
   */
  size?: number;

  /**
   * 모서리 반경(px 또는 CSS 값). 원형은 "50%"
   */
  radius?: number | string;

  /**
   * 접근성 이름. decorative면 무시
   */
  alt?: string;

  /**
   * 상위 요소가 이미 접근성 이름을 가질 때 true. 로고를 장식으로 처리
   */
  decorative?: boolean;

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        flexShrink: 0,
        display: "inline-flex",
        background: "#ffffff",
        boxShadow: "var(--shadow-inset-hairline)",
        ...style,
      }}
    >
      <Image
        src={BRAND_LOGO_SRC}
        alt={decorative ? "" : alt}
        aria-hidden={decorative || undefined}
        width={size}
        height={size}
        draggable={false}
        priority={false}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          // 원본의 흰 여백만 줄이고 거친 원형 외곽은 보존
          width: "124%",
          height: "124%",
          transform: "translate(-50%, -50%)",
          objectFit: "contain",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </span>
  );
}
