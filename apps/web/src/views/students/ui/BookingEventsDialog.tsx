"use client";

/**
 * 예약 변경 이력 — 명단 행의 **최신 로그 셀을 눌렀을 때만** 읽는다
 * (계약 GET /api/v1/admin/family-bookings/{id}/events). 행마다 미리 읽으면 N+1 이다.
 *
 * 한 학생의 이력이 가족 예약 집계 하나로 끝나지 않을 수 있다: 취소한 뒤 다시 예약하면
 * 새 집계가 생기고 옛 기록은 그대로 남는다. 그래서 여기서는 계약이 `bookingHistory` 로
 * 알려 준 집계들을 모두 읽어 **하나의 시간순 계보**로 잇고, 어느 집계의 줄인지도 밝힌다.
 */

import {
  AUDIT_ACTOR_TYPE_LABELS,
  BOOKING_CANCELLATION_TYPE_LABELS,
  auditActorLabel,
  rosterEventLabel,
  rosterHistoryTargets,
} from "@/shared/api";
import type { SessionRosterRow } from "@/shared/api";
import { useRosterEventLineage } from "@/features/manage-family-booking";
import { fmtDateTimeShort } from "@/shared/lib/format";
import { Badge, Button, Dialog, EmptyState } from "@/shared/ui";

const at = (iso: string) => fmtDateTimeShort(new Date(iso));

export function BookingEventsDialog({
  row,
  onClose,
}: {
  /** null 이면 닫힌 상태 — 훅이 아무 요청도 내지 않는다. */
  row: SessionRosterRow | null;
  onClose: () => void;
}) {
  const lineage = useRosterEventLineage(row?.bookingHistory ?? null);

  if (row === null) return null;

  /** 첫 읽기가 통째로 실패했을 때만 목록을 대신한다. */
  const emptyWithError = lineage.error !== null && lineage.events.length === 0;
  /** 취소 뒤 재예약 — 이력이 여러 집계에 걸쳐 있다는 사실을 숨기지 않는다. */
  const multiAggregate = lineage.aggregateCount > 1;

  /**
   * 집계별 순번 — 어느 예약의 줄인지 사람 말로 가리키기 위한 표시용 번호다.
   *
   * ★ `row.bookingHistory` 를 그대로 세지 않는다: 서버 순서는 *현재 집계 우선*일 수 있어
   *   그러면 `예약 1` 이 최신 예약을 가리키고 아래 시간순 계보와 어긋난다. 계보를 부를 때
   *   쓴 것과 **같은** 오래된-순 정렬(rosterHistoryTargets)에서 번호를 매겨 둘을 일치시킨다.
   */
  const aggregates = rosterHistoryTargets(row.bookingHistory);
  const order = new Map(aggregates.map((reference, index) => [reference.familyBookingId, index + 1]));

  return (
    <Dialog
      open
      onClose={onClose}
      title="예약 변경 이력"
      width={540}
      footer={
        <Button variant="ghost" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 연락처는 표에 이미 있다 — 이력 모달에서까지 되풀이하지 않는다. */}
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          <b>{row.name}</b> · {row.representativeClassName}
          {multiAggregate && (
            <>
              <br />
              취소 뒤 다시 예약해서 <b>예약 {lineage.aggregateCount}건</b>에 이력이 나뉘어 있어요 — 아래는 그 전부를
              시간순으로 이은 기록이에요.
            </>
          )}
        </p>

        <div aria-live="polite" aria-busy={lineage.loading} style={{ minHeight: 96 }}>
          {lineage.loading && <EmptyState>이력을 불러오는 중이에요…</EmptyState>}

          {!lineage.loading && emptyWithError && (
            <div role="alert" style={{ textAlign: "center", padding: "24px 0" }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-body)" }}>{lineage.error}</p>
              <Button variant="secondary" size="sm" onClick={lineage.reload}>
                다시 시도
              </Button>
            </div>
          )}

          {!lineage.loading && !emptyWithError && lineage.events.length === 0 && (
            <EmptyState>남아 있는 이력이 없어요.</EmptyState>
          )}

          {!lineage.loading && lineage.events.length > 0 && (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {lineage.events.map((event) => (
                <li
                  key={event.eventId}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-xs)",
                    background: "var(--surface-sunken)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>
                      {/* 서버가 이미 문구를 준 최신 1건은 그 값을 그대로 쓴다. */}
                      {row.latestOperationalEvent?.eventId === event.eventId
                        ? row.latestOperationalEvent.label
                        : rosterEventLabel(event.type, event.actor.type)}
                    </b>
                    <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
                      {at(event.occurredAt)}
                    </span>
                    {multiAggregate && (
                      <Badge tone="neutral" size="sm">
                        예약 {order.get(event.familyBookingId) ?? "?"}
                      </Badge>
                    )}
                    {/* 취소 갈래는 typed 필드로만 말한다 — reason·metadata 로 추정하지 않는다. */}
                    {event.cancellationType !== null && (
                      <Badge tone="danger" size="sm" style={{ marginInlineStart: "auto" }}>
                        {/* 스크린리더에 갈래의 의미를 밝히는 접근성 접두사 — 화면에는 보이지 않는다. */}
                        <span
                          style={{
                            position: "absolute",
                            width: 1,
                            height: 1,
                            margin: -1,
                            padding: 0,
                            overflow: "hidden",
                            clip: "rect(0 0 0 0)",
                            whiteSpace: "nowrap",
                            border: 0,
                          }}
                        >
                          취소 유형{" "}
                        </span>
                        {BOOKING_CANCELLATION_TYPE_LABELS[event.cancellationType]}
                      </Badge>
                    )}
                  </span>
                  {event.reason !== null && (
                    <span style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>{event.reason}</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{auditActorLabel(event.actor)}</span>
                </li>
              ))}
            </ol>
          )}
          {/*
            잘림 안내가 여기 없는 것은 의도다 — 훅이 집계마다 커서를 끝까지 따라가 **전부**
            읽는다. 끝까지 읽지 못하면 반쪽을 보여 주는 대신 위 오류 갈래로 간다.
          */}
        </div>

        {multiAggregate && (
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: "10px 12px",
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--border-hairline)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {/* 위 계보의 `예약 N` 배지와 **같은 번호**여야 한다 — 그래서 같은 정렬을 쓴다. */}
            {aggregates.map((reference) => (
              <li
                key={reference.familyBookingId}
                style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}
              >
                <b style={{ fontWeight: 700 }}>예약 {order.get(reference.familyBookingId)}</b>
                <span>{at(reference.createdAt)} 생성</span>
                {reference.cancelledAt !== null && <span>· {at(reference.cancelledAt)} 취소</span>}
                {reference.current && <Badge tone="brand" size="sm">현재</Badge>}
              </li>
            ))}
          </ol>
        )}

        <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
          {AUDIT_ACTOR_TYPE_LABELS.PUBLIC_PROOF} 기록은 학부모가 직접 한 조작이에요.
        </p>
      </div>
    </Dialog>
  );
}
