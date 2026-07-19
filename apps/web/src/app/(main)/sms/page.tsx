import { requireModuleAccess } from "@/server/services";
import { SmsView } from "@/views/sms";

export const dynamic = "force-dynamic";

/**
 * 문자 발송 (명세 §5 · 계약 tag: Admin SMS).
 *
 * 보류 화면을 걷어냈다. 그 화면이 있던 이유는 이전 구현이 운영 Nest API 가 아니라 프로세스
 * 로컬 memory 서비스에 쓰고도 "발송했어요"를 띄울 수 있었기 때문이다 — 이제 이 화면은
 * same-origin `/api/v1/admin/sms/*` 만 호출하고, 발송은 서버 프리뷰 + 명시적 확인을 거친다.
 *
 * 가드는 다른 콘솔 화면과 같다: `(main)` 레이아웃이 매 요청 Nest 에 되물어 ADMIN 세션만
 * 통과시키고, 여기서 모듈 접근을 한 번 더 확인한다. 데이터는 전부 브라우저가 직접 읽는다.
 */
export default async function SmsPage() {
  await requireModuleAccess("sms");

  return <SmsView />;
}
