/**
 * 카드 연결 표시 규칙 — 순수 함수라 값으로 바로 확인한다 (node:test + tsx).
 * 핵심 불변식: durable ACTIVE ≠ 연결됨. 연결 여부는 presence(online)만 근거로 한다.
 *
 * 실행: npm --prefix apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFLINE_PRESENCE_LABEL, scannerPresence } from "./devicePresence";

describe("scannerPresence — 연결 여부는 heartbeat presence(online)만 근거로 한다", () => {
  it("online=true 면 연결됨·온라인 을 말하고 tone 은 success", () => {
    const presence = scannerPresence({ online: true });
    assert.equal(presence.online, true);
    assert.equal(presence.tone, "success");
    assert.match(presence.label, /연결됨/);
    assert.match(presence.label, /온라인/);
  });

  it("online=false(durable ACTIVE)면 정확히 '오프라인 · 페어링 유지' — '연결됨'을 절대 말하지 않는다", () => {
    const presence = scannerPresence({ online: false });
    assert.equal(presence.online, false);
    assert.equal(presence.tone, "faint");
    assert.equal(presence.label, OFFLINE_PRESENCE_LABEL);
    assert.equal(presence.label, "오프라인 · 페어링 유지");
    assert.ok(!presence.label.includes("연결됨"), "offline 카드에 연결됨 문구가 들어가면 안 된다");
  });
});
