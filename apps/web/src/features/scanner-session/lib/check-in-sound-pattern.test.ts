/**
 * 결과음 패턴 순수 테스트 (node:test + tsx). Web Audio·React 를 import 하지 않는다.
 * 길이(성공 딩동 0.7~1.0초)와 세 패턴의 분명한 구분을 고정한다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CheckInSoundKind } from "./check-in-sound";
import { CHECK_IN_SOUND_PATTERNS, patternDurationSeconds } from "./check-in-sound-pattern";

const KINDS: CheckInSoundKind[] = ["success", "warning", "error"];

describe("check-in-sound-pattern — 톤 무결성", () => {
  it("모든 패턴은 최소 한 톤을 가지며 시간·주파수가 양수다", () => {
    for (const kind of KINDS) {
      const tones = CHECK_IN_SOUND_PATTERNS[kind];
      assert.ok(tones.length >= 1, `${kind} 톤 있음`);
      for (const tone of tones) {
        assert.ok(tone.freq > 0, `${kind} freq>0`);
        assert.ok(tone.duration > 0, `${kind} duration>0`);
        assert.ok(tone.offset >= 0, `${kind} offset>=0`);
      }
    }
  });

  it("한 패턴 안의 톤은 시작 시각(offset) 순으로 겹치지 않게 배치된다", () => {
    for (const kind of KINDS) {
      const tones = CHECK_IN_SOUND_PATTERNS[kind];
      for (let i = 1; i < tones.length; i += 1) {
        assert.ok(tones[i].offset >= tones[i - 1].offset, `${kind} offset 단조 증가`);
      }
    }
  });
});

describe("patternDurationSeconds — 길이 규격", () => {
  it("성공(딩동)은 약 0.7~1.0초", () => {
    const duration = patternDurationSeconds("success");
    assert.ok(duration >= 0.7 && duration <= 1.0, `성공 길이 ${duration}s 는 0.7~1.0`);
  });

  it("경고·오류는 뚜렷하게 들리도록 0.4초 이상 이어진다", () => {
    assert.ok(patternDurationSeconds("warning") >= 0.4);
    assert.ok(patternDurationSeconds("error") >= 0.4);
  });
});

describe("세 패턴의 구분(현장에서 귀로 갈림)", () => {
  it("성공은 상승(뒤 톤이 더 높다)", () => {
    const [first, second] = CHECK_IN_SOUND_PATTERNS.success;
    assert.ok(second.freq > first.freq, "성공은 상승");
  });

  it("경고는 같은 중음을 반복한다(모든 톤 주파수가 동일)", () => {
    const freqs = CHECK_IN_SOUND_PATTERNS.warning.map((t) => t.freq);
    assert.ok(freqs.length >= 2, "경고는 2음 이상");
    assert.ok(freqs.every((f) => f === freqs[0]), "경고는 동일 주파수 반복");
  });

  it("오류는 저음에서 계속 하강한다(톤마다 주파수가 낮아진다)", () => {
    const freqs = CHECK_IN_SOUND_PATTERNS.error.map((t) => t.freq);
    for (let i = 1; i < freqs.length; i += 1) {
      assert.ok(freqs[i] < freqs[i - 1], "오류는 하강");
    }
  });

  it("세 패턴의 시작 주파수가 서로 다르다", () => {
    const heads = KINDS.map((kind) => CHECK_IN_SOUND_PATTERNS[kind][0].freq);
    assert.equal(new Set(heads).size, KINDS.length, "시작 주파수 모두 다름");
  });
});
