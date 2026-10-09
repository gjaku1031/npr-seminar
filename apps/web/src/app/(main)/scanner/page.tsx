import { ScannerView } from "@/views/scanner";

/**
 * QR 스캐너 관리 화면. 기기 모니터링 + iPad 연결 코드 발급·해제
 *
 * 기기 목록·페어링·해제도, 하단 요약의 회차 원장도 전부 브라우저가 계약을 직접 부름
 * (ADMIN 세션 쿠키 기준)
 */
export default function ScannerPage() {
  return <ScannerView />;
}
