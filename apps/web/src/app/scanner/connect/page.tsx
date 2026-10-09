import type { Metadata } from "next";
import { ScannerConnectView } from "@/views/scanner-connect";

/**
 * iPad 스캐너 연결 (공개 라우트)
 *
 * 관리자 콘솔 셸`(main)` 밖에 둠: 게이트 스태프는 관리자 로그인 없이 이 화면만 쓰고,
 * 권한은 페어링 코드로 얻는 SCANNER 세션(HttpOnly 쿠키)이 결정함
 * 관리자 가드는 `(main)` 레이아웃에 있으므로 그 밖인 이 경로에는 애초에 걸리지 않음
 *
 * 서버에서 세션을 판정하지 않음 — SCANNER 쿠키는 Nest 가 소유하므로
 * 클라이언트가 `/api/v1/scanner/current` 로 확인함
 */
export const metadata: Metadata = {
  title: "iPad 스캐너 연결",
  // 현장 기기 전용 화면이라 검색 노출 대상이 아님
  robots: { index: false, follow: false },
};

/**
 * iPad 스캐너 연결 화면
 */
export default function ScannerConnectPage() {
  return <ScannerConnectView />;
}
