"use client";

/**
 * 체크인 결과음 — Web Audio 로 즉석 생성하는 짧은 톤 (오디오/이미지 자산을 새로 만들지 않는다).
 *
 * iPad/Safari 자동재생 정책:
 * - AudioContext 는 **실제 사용자 제스처** 안에서 resume 해야 소리가 난다. 그래서 `unlock()` 을
 *   제공하고, `ctx.state === "running"` 이 된 뒤에만 `ready` 를 true 로 둔다 — 잠금 해제 전에
 *   준비됐다고 말하지 않는다.
 * - 음소거는 사용자 설정이라 localStorage 에 남긴다(민감 정보 아님). 잠금 상태는 페이지마다
 *   제스처로 다시 풀어야 하므로 저장하지 않는다.
 *
 * 정리:
 * - 언마운트 시 AudioContext 를 닫는다. 오실레이터는 stop 이후 스스로 정리되고, DOM 리스너·타이머를
 *   남기지 않는다.
 * - QR 원문 등 민감 데이터는 다루지 않는다 — 소리 종류(success/warning/error)만 받는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckInSoundKind } from "../lib/check-in-sound";

/** 음소거 사용자 설정 저장 키. 값은 "1"(음소거)/"0"(해제)만 담는다. */
const MUTE_STORAGE_KEY = "npr.scanner.checkin-sound.muted";

interface Tone {
  freq: number;
  /** 패턴 시작 기준 오프셋(초). */
  offset: number;
  duration: number;
}

/** 결과별 톤 패턴 — 자산 없이 사인파로만. 성공은 상승 2음, 경고는 반복 2음, 오류는 하강 저음. */
const PATTERNS: Record<CheckInSoundKind, Tone[]> = {
  success: [
    { freq: 880, offset: 0, duration: 0.12 },
    { freq: 1318.5, offset: 0.1, duration: 0.18 },
  ],
  warning: [
    { freq: 620, offset: 0, duration: 0.13 },
    { freq: 620, offset: 0.18, duration: 0.15 },
  ],
  error: [
    { freq: 320, offset: 0, duration: 0.18 },
    { freq: 190, offset: 0.16, duration: 0.26 },
  ],
};

const PEAK_GAIN = 0.16;

type AudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function readMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* 저장 실패는 무시 — 소리 동작에는 영향 없다. */
  }
}

function playPattern(ctx: AudioContext, tones: Tone[]): void {
  const base = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    const start = base + tone.offset;
    const end = start + tone.duration;
    // 클릭음 방지 — 짧은 페이드 인/아웃 엔벨로프.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    // stop 이후 노드는 GC 대상 — 별도 정리 없이도 누수되지 않는다.
    osc.stop(end + 0.02);
  }
}

/** running 인 컨텍스트에서만 안전하게 재생한다(재생 실패는 조용히 무시). 결과음·확인음 공용. */
function safePlayPattern(ctx: AudioContext, tones: Tone[]): void {
  if (ctx.state !== "running") return;
  try {
    playPattern(ctx, tones);
  } catch {
    /* 재생 실패는 조용히 무시 — 결과 표시(문구·색)가 이미 있다. */
  }
}

export interface CheckInSound {
  /** AudioContext 가 실제로 잠금 해제(running)됐는가 — true 여야만 소리를 약속한다. */
  ready: boolean;
  muted: boolean;
  /** 사용자 제스처 안에서 호출해야 한다(iPad/Safari). */
  unlock: () => void;
  toggleMute: () => void;
  /** 결과 소리 재생. 잠금 해제 전·음소거 중에는 조용히 무시한다. */
  play: (kind: CheckInSoundKind) => void;
}

export function useCheckInSound(): CheckInSound {
  const ctxRef = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);
  // 서버·클라이언트 첫 렌더 모두 false 로 시작해 하이드레이션이 어긋나지 않는다.
  // 저장된 음소거 설정은 잠금 해제(unlock) 제스처에서 처음 읽는다 — 음소거 UI 는 ready 이후에만
  // 보이므로 마운트 시 상태를 미리 세팅할(=effect 안에서 setState 할) 이유가 없다.
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

    // 저장된 음소거 설정을 여기서 처음 읽어 ref·상태에 반영한다(제스처 → 클라이언트 전용, 안전).
    // 확인음 판정(settle)이 이 값을 읽으므로 resume 전에 동기로 세팅한다.
    const storedMuted = readMuted();
    mutedRef.current = storedMuted;
    setMuted(storedMuted);

    let confirmed = false;
    const settle = () => {
      const running = ctx.state === "running";
      setReady(running);
      // 컨텍스트가 실제로 running 이 된 뒤 딱 한 번 확인음을 낸다 — 운영자가 소리를 바로 검증한다.
      // 저장된 상태가 음소거면 오해를 부르지 않도록 재생하지 않는다.
      // (checkIn.panel 을 건드리지 않으므로 직전 결과음이 다시 울리지 않는다.)
      if (running && !confirmed) {
        confirmed = true;
        if (!mutedRef.current) safePlayPattern(ctx, PATTERNS.success);
      }
    };
    // 제스처 안에서 무음 버퍼를 한 번 재생한다 — 일부 Safari 는 이 과정이 있어야 잠금이 풀린다.
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      /* 무음 버퍼 실패는 치명적이지 않다 — resume 결과로 ready 를 판정한다. */
    }
    void ctx.resume().then(settle).catch(settle);
    settle();
  }, []);

  const toggleMute = useCallback(() => {
    // mutedRef 를 즉시 갱신해 play·확인음 판정이 다음 렌더를 기다리지 않게 한다.
    const next = !mutedRef.current;
    mutedRef.current = next;
    writeMuted(next);
    setMuted(next);
    // 음소거를 **해제**하는 순간, running 이면 확인음을 한 번 — 소리가 살아있음을 알린다.
    // 확인음은 새 톤을 직접 재생할 뿐이라 직전 체크인 패널을 다시 울리지 않는다.
    if (!next) {
      const ctx = ctxRef.current;
      if (ctx) safePlayPattern(ctx, PATTERNS.success);
    }
  }, []);

  // muted 는 ref 로 읽어 play 참조를 안정적으로 유지한다 — 음소거 토글이 패널 효과를 재실행해
  // 직전 결과음을 되풀이하지 않게 한다.
  const play = useCallback((kind: CheckInSoundKind) => {
    if (mutedRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    safePlayPattern(ctx, PATTERNS[kind]);
  }, []);

  return { ready, muted, unlock, toggleMute, play };
}
