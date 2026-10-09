import "server-only";
import { z } from "zod";

/**
 * 서버 env 격리 지점. `import "server-only"` 가 이 값이 클라이언트 번들로 새는 경로를 막음
 * 현재 클라이언트에 노출하는 env(NEXT_PUBLIC_*)는 하나도 없음. 생기면 여기가 아니라
 * 별도 클라이언트 모듈에 두어 서버·클라이언트 env 를 파일 단위로 갈라 놓음
 *
 * 이 앱은 DB credential 도 외부 서비스 키도 받지 않음 (docs/monorepo.md). 서버가 알아야 할
 * 것은 "Nest 를 어디서 부르는가" 하나뿐이라 스키마도 그 하나임. 새 값을 추가하기 전에,
 * 그것이 정말 웹 서버의 몫인지 — Nest 의 몫이 아닌지 — 먼저 확인함
 */
const schema = z.object({
  /**
   * 서버→서버 Nest API origin. 브라우저는 언제나 same-origin `/api/v1` 만 부르지만(계약 §servers),
   * 서버 컴포넌트의 fetch 는 절대 URL 이 필요함
   *
   * 미설정 시 요청 헤더에서 자기 origin 을 복원해 same-origin 으로 부름 —
   * 이는 앞단 프록시가 이미 `/api/v1` 을 Nest 로 보내는 배포(next.config.ts 주석 참조)를 위한 것임
   * 세션 쿠키를 실어 보내는 경로이므로 운영에서는 명시 설정을 권장함
   * (ops/pve-release 의 web 유닛은 `http://127.0.0.1:4000` 을 고정으로 줌)
   */
  NEST_API_ORIGIN: z.string().min(1).optional(),
});

/**
 * 검증한 env 캐시
 */
let cached: z.infer<typeof schema> | null = null;

/**
 * 서버 env 를 처음 한 번 검증하고 캐시해 돌려줌
 */
export function serverEnv() {
  cached ??= schema.parse({
    NEST_API_ORIGIN: process.env.NEST_API_ORIGIN,
  });
  return cached;
}
