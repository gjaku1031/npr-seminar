import type { Seminar } from "../model/seminar";
import { seminarStatusLabel } from "../model/seminar";

// 로케일·타임존을 고정해 서버/클라이언트 렌더 결과를 결정적으로 유지한다.
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

/** 도메인 표시 컴포넌트 — 도메인 모델만 안다. 스타일은 새 디자인 시스템 도입 시 shared/ui로 대체 예정(설계 §8). */
export function SeminarCard({ seminar }: { seminar: Seminar }) {
  return (
    <article className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{seminar.title}</h3>
        <span className="shrink-0 text-sm text-gray-500">{seminarStatusLabel[seminar.status]}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        {seminar.speaker} · {dateFormat.format(seminar.startsAt)}
      </p>
    </article>
  );
}
