import { listSeminars } from "@/server/services";
import { SeminarsView } from "@/views/seminars";

// DB를 읽는 페이지 — 빌드 타임 프리렌더가 DB를 치지 않도록 동적 렌더 고정 (설계 §5).
export const dynamic = "force-dynamic";

/** 페이지 = 데이터 로더 + views 위임 (설계 §5). 서버 조회는 app·features/<slice>/api에서만 (R1). */
export default async function SeminarsPage() {
  const seminars = await listSeminars();
  return <SeminarsView seminars={seminars} />;
}
