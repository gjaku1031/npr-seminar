import { permanentRedirect } from "next/navigation";

/**
 * 옛 공개 예약 경로 — 이제 학부모 앱은 루트(`/`)다.
 *
 * 308 영구 이동으로 남긴다: 이미 배포된 문자·공유 링크가 `/reserve` 를 가리키고 있다
 * (`server/sms/urls.ts`). 루프는 없다 — `/` 는 이 라우트를 다시 가리키지 않고,
 * 관리자 가드는 `(main)` 레이아웃에만 있어 `/` 와 `/reserve` 는 모두 공개다.
 */
export default function LegacyReserveRedirectPage(): never {
  permanentRedirect("/");
}
