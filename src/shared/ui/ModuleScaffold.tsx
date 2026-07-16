/**
 * 모듈 화면 뼈대 — 데이터 경로가 연결됐음을 보이고, 화면 구현이 남았음을 명시한다.
 *
 * 2026-07-16 범위(결정 S10): 핵심 도메인(설명회·예약·재원생) 외 모듈은 라우트·권한·조회 경로까지만.
 * 화면을 채울 때 이 컴포넌트를 views/<모듈>로 교체한다.
 * ⚠️ 디자인 시스템 정식 컴포넌트가 shared/ui에 들어오면 함께 정리 대상 (설계 §8).
 */
export function ModuleScaffold({
  title,
  description,
  spec,
  children,
}: {
  title: string;
  description: string;
  /** 근거 명세 절 — 구현 시 참조 */
  spec: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </header>

      <p className="rounded-sm border border-hairline bg-brand-soft px-4 py-3 text-sm text-body">
        화면 구현 예정 — 데이터 경로·권한은 연결됨. 근거 명세: <span className="font-medium">{spec}</span>
      </p>

      {children}
    </div>
  );
}

/** 조회 경로가 살아있음을 보이는 최소 표 */
export function ScaffoldCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-sm border border-hairline bg-card px-3 py-2 shadow-card">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-lg font-semibold text-ink">{value}</span>
    </div>
  );
}
