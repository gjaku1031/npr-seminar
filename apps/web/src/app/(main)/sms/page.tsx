import { SmsView } from "@/views/sms";

/**
 * 문자 발송 화면. 계약 tag: Admin SMS
 *
 * same-origin `/api/v1/admin/sms/*` 만 호출하고, 발송은 서버 프리뷰 + 명시적 확인을 거침
 *
 * `(main)` 레이아웃의 브라우저 게이트가 ADMIN 세션 확인 뒤 화면을 마운트함
 * 데이터 권한은 Nest API가 강제함
 */
export default function SmsPage() {
  return <SmsView />;
}
