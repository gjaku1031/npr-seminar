"use client";

/**
 * 체크인 결과음 — Web Audio 로 즉석 생성하는 짧은 톤 (오디오/이미지 자산을 새로 만들지 않음)
 *
 * iPad/Safari 자동재생 정책:
 * - AudioContext 는 실제 사용자 제스처 안에서 resume 해야 소리가 남. 그래서 `unlock()` 을
 *   제공하고, `ctx.state === "running"` 이 된 뒤에만 `ready` 를 true 로 둠 — 잠금 해제 전에
 *   준비됐다고 말하지 않음. `unlock()` 은 '이 회차로 스캔 시작' 같은 실제 클릭 제스처의
 *   콜스택 안에서 호출돼야 함(ScannerShiftPanel.onBeforeLock → 여기)
 * - 음소거는 이 세션 한정 설정임. 화면에 들어올 때마다 결과음은 기본 ON 이고, 과거의
 *   localStorage 음소거 값이 기본을 꺼 버리지 않도록 저장하지 않음. 볼륨은 기기 하드웨어를
 *   따르며 별도 슬라이더를 두지 않음
 *
 * 정리:
 * - 언마운트 시 AudioContext 를 닫음. 오실레이터는 stop 이후 스스로 정리되고, DOM 리스너·타이머를
 *   남기지 않음
 * - QR 원문 등 민감 데이터는 다루지 않음 — 소리 종류(success/warning/error)만 받음
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckInSoundKind } from "../lib/check-in-sound";
import { CHECK_IN_SOUND_PATTERNS, type Tone } from "../lib/check-in-sound-pattern";

/**
 * 결과별 톤 패턴 — 순수 모듈에서 가져옴(길이·구분은 거기서 테스트함)
 */
const PATTERNS = CHECK_IN_SOUND_PATTERNS;

/**
 * 결과음 최대 음량
 */
const PEAK_GAIN = 0.16;

/**
 * AudioContext 생성자 타입
 */
type AudioContextCtor = typeof AudioContext;

/**
 * 브라우저의 AudioContext 생성자. 없으면 null
 */
function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

/**
 * 음 목록을 이어서 재생
 */
function playPattern(ctx: AudioContext, tones: Tone[]): void {
  const base = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    const start = base + tone.offset;
    const end = start + tone.duration;
    // 클릭음 방지 — 짧은 페이드 인/아웃 엔벨로프
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    // stop 이후 노드는 GC 대상 — 별도 정리 없이도 누수되지 않음
    osc.stop(end + 0.02);
  }
}

/**
 * running 인 컨텍스트에서만 안전하게 재생함(재생 실패는 조용히 무시). 결과음·확인음 공용
 */
function safePlayPattern(ctx: AudioContext, tones: Tone[]): void {
  if (ctx.state !== "running") return;
  try {
    playPattern(ctx, tones);
  } catch {
    // 재생 실패는 조용히 무시 — 결과 표시(문구·색)가 이미 있음
  }
}

/**
 * 체크인 결과음 상태와 동작
 */
export interface CheckInSound {
  /**
   * AudioContext 가 실제로 잠금 해제(running)됐는가 — true 여야만 소리를 약속함
   */
  ready: boolean;

  /**
   * 음소거 여부
   */
  muted: boolean;
  /**
   * 사용자 제스처 안에서 호출해야 함(iPad/Safari)
   */
  unlock: () => void;

  /**
   * 음소거 전환
   */
  toggleMute: () => void;
  /**
   * 결과 소리 재생. 잠금 해제 전·음소거 중에는 조용히 무시함
   */
  play: (kind: CheckInSoundKind) => void;
}

/**
 * 체크인 결과음 훅. 세션마다 소리 켜짐으로 시작
 */
export function useCheckInSound(): CheckInSound {
  const ctxRef = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);
  // 음소거는 이 세션 한정이라 항상 false(=소리 켜짐)로 시작함 — 과거 설정을 복원하지 않음
  // 음소거 UI 는 ready 이후에만 보이므로 마운트 시 미리 세팅할 이유가 없음
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);

  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, []);

  const unlock = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = resolveAudioContextCtor();
      if (!Ctor) return;
      ctxRef.current = new Ctor();
    }
    const ctx = ctxRef.current;

    let confirmed = false;
    const settle = () => {
      const running = ctx.state === "running";
      setReady(running);
      // 컨텍스트가 실제로 running 이 된 뒤 딱 한 번 확인음을 냄 — 운영자가 소리를 바로 검증함
      // 음소거 중이면 오해를 부르지 않도록 재생하지 않음
      // (checkIn.panel 을 건드리지 않으므로 직전 결과음이 다시 울리지 않음.)
      if (running && !confirmed) {
        confirmed = true;
        if (!mutedRef.current) safePlayPattern(ctx, PATTERNS.success);
      }
    };
    // 제스처 안에서 무음 버퍼를 한 번 재생함 — 일부 Safari 는 이 과정이 있어야 잠금이 풀림
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // 무음 버퍼 실패는 치명적이지 않음 — resume 결과로 ready 를 판정함
    }
    void ctx.resume().then(settle).catch(settle);
    settle();
  }, []);

  const toggleMute = useCallback(() => {
    // mutedRef 를 즉시 갱신해 play·확인음 판정이 다음 렌더를 기다리지 않게 함
    // 세션 한정 설정이라 저장하지 않음 — 다음 화면 진입은 다시 소리 켜짐으로 시작함
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    // 음소거를 해제하는 순간, running 이면 확인음을 한 번 — 소리가 살아있음을 알림
    // 확인음은 새 톤을 직접 재생할 뿐이라 직전 체크인 패널을 다시 울리지 않음
    if (!next) {
      const ctx = ctxRef.current;
      if (ctx) safePlayPattern(ctx, PATTERNS.success);
    }
  }, []);

  // muted 는 ref 로 읽어 play 참조를 안정적으로 유지함 — 음소거 토글이 패널 효과를 재실행해
  // 직전 결과음을 되풀이하지 않게 함
  const play = useCallback((kind: CheckInSoundKind) => {
    if (mutedRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    safePlayPattern(ctx, PATTERNS[kind]);
  }, []);

  return { ready, muted, unlock, toggleMute, play };
}
