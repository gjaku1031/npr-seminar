/* 간담회 예약 — 미구현 placeholder */
function CounselScreen() {
  const { Card, Badge } = window.DesignSystem_179b2a;
  const I = window.NPRIcons;
  return (
    <div data-screen-label="간담회 예약">
      <div style={{ animation: 'ds-fade-up var(--dur-slow) var(--ease-out) both' }}>
        <div style={{ fontSize: 12, letterSpacing: 'var(--tracking-caps)', fontWeight: 700, color: 'var(--text-accent)', marginBottom: 6 }}>MEETING</div>
        <h1 style={{ fontSize: 'var(--text-h1)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>간담회 예약 <Badge tone="neutral">준비 중</Badge></h1>
      </div>
      <Card padding="0" style={{ marginTop: 22 }}>
        <div style={{ padding: '70px 30px', textAlign: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--violet-50)', color: 'var(--violet-800)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I.clipboard size={24} /></span>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginTop: 14 }}>간담회 예약 기능은 아직 구현 전입니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>설명회 참석 학부모 대상 소규모 간담회 신청·배정 기능이 이 자리에 들어옵니다.<br />요구사항이 확정되면 구현할 예정이에요.</div>
        </div>
      </Card>
    </div>
  );
}
window.CounselScreen = CounselScreen;
