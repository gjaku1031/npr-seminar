import type { Seminar } from "@/entities/seminar";
import { SeminarCard } from "@/entities/seminar";
import { CreateSeminarForm } from "@/features/create-seminar";

/**
 * 화면 조합 — 데이터는 page(RSC)가 props로 내려준다. 서버를 모르므로(@/server 금지, R1)
 * 서버/클라이언트 어느 쪽으로도 조합 가능하고 테스트가 쉽다 (설계 §5).
 */
export function SeminarsView({ seminars }: { seminars: Seminar[] }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">세미나 등록</h2>
        <CreateSeminarForm />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">세미나 목록 ({seminars.length})</h2>
        {seminars.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 세미나가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {seminars.map((seminar) => (
              <li key={seminar.id}>
                <SeminarCard seminar={seminar} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
