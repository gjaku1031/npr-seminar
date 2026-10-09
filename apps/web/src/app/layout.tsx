import type { Metadata } from "next";
import localFont from "next/font/local";
import { brandSeminarTitle } from "@/shared/ui/brand";
import "./globals.css";

/* 디자인 시스템 폰트. 디스플레이 NanumSquareRound · 본문 Pretendard */

/**
 * 본문 글꼴 Pretendard
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
});

/**
 * 디스플레이 글꼴 NanumSquareRound
 */
const nanumSquareRound = localFont({
  src: [
    { path: "./fonts/NanumSquareRoundL.woff2", weight: "300" },
    { path: "./fonts/NanumSquareRoundR.woff2", weight: "400" },
    { path: "./fonts/NanumSquareRoundB.woff2", weight: "700" },
    { path: "./fonts/NanumSquareRoundEB.woff2", weight: "800" },
  ],
  variable: "--font-nanum",
  display: "swap",
});

/**
 * 페이지 메타데이터
 */
export const metadata: Metadata = {
  title: `${brandSeminarTitle()} — 운영 콘솔`,
  description: `${brandSeminarTitle()} 예약 · 현장 운영 통합 시스템`,
};

/**
 * 모든 페이지 공통 루트 레이아웃. 글꼴 변수를 html 에 붙임
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${pretendard.variable} ${nanumSquareRound.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
