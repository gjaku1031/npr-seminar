/**
 * BrandMark — 예시학원 실제 로고를 보여주는 재사용 브랜드 마크.
 *
 * 가짜 "npr" 텍스트 배지를 대체한다. 사용자 제공 원본 JPG 를 그대로 쓰고,
 * 정사각 프레임에 `overflow: hidden` 으로 흰 여백만 클리핑해 타이트하게 프레이밍한다.
 * (원본 픽셀·내부 흰색 한글 글자를 모두 보존 — 흰색 전역 제거 없음.)
 *
 * 접근성: 의미 있는 로고면 `alt`(기본 "예시학원")를 낭독하고,
 * 상위 링크가 이미 이름을 가지면 `decorative` 로 중복 낭독을 피한다.
 */

import Image from "next/image";
import type { CSSProperties } from "react";
import { BRAND_LOGO_SRC, BRAND_NAME } from "./brand";

export function BrandMark({
  size = 28,
  radius = 9,
  alt = BRAND_NAME,
  decorative = false,
  style,
}: {
  /** 정사각 프레임 한 변(px). */
  size?: number;
  /** 모서리 반경(px 또는 CSS 값). 원형 배지는 "50%". */
  radius?: number | string;
  /** 접근성 이름. decorative 가 true 면 무시된다. */
  alt?: string;
  /** 상위 요소가 이미 접근성 이름을 가질 때 true — 로고를 장식으로 처리. */
  decorative?: boolean;
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
          // 원본의 흰 여백만 줄이되 거친 원형 외곽은 전부 보존한다.
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
