import { SmsView } from "@/views/sms";

/**
 * 문자 발송 (명세 §5 · 계약 tag: Admin SMS).
 *
 * 보류 화면을 걷어냈다. 그 화면이 있던 이유는 이전 구현이 운영 Nest API 가 아니라 프로세스
 * 로컬 memory 서비스에 쓰고도 "발송했어요"를 띄울 수 있었기 때문이다 — 이제 이 화면은
 * same-origin `/api/v1/admin/sms/*` 만 호출하고, 발송은 서버 프리뷰 + 명시적 확인을 거친다.
 *
 * `(main)` 레이아웃의 브라우저 게이트가 ADMIN 세션 확인 뒤 화면을 마운트한다.
 * 데이터 권한은 Nest API가 강제한다.
 */
export default function SmsPage() {
  return <SmsView />;
}
