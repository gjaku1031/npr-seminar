import "server-only";
import type { Session } from "@/entities/session";
import type { Reservation } from "@/entities/reservation";
import type { Student } from "@/entities/student";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type { Device } from "@/entities/device";
import { seedDataset } from "../../seed/data";

/**
 * 인메모리 스토어 — 설계 §6.3의 "교체 가능성 상시 증명" 장치이자 DB 없는 로컬 구동 수단.
 *
 * globalThis 캐시: Next dev의 모듈 재평가(HMR)에도 데이터가 유지되도록.
 * 시드 데이터셋은 server/seed/data.ts — DB 시드 스크립트(scripts/seed.ts)와 공유해
 * 메모리 구동과 Neon 구동의 화면이 동일하다.
 */

export interface MemoryDb {
  teachers: Map<string, Teacher>;
  classes: Map<string, Class>;
  students: Map<string, Student>;
  admin: User;
  sessions: Map<string, Session>;
  reservations: Map<string, Reservation>;
  smsTemplates: Map<string, SmsTemplate>;
  smsLogs: Map<string, SmsLog>;
  surveys: Map<string, SurveyResponse>;
  devices: Map<string, Device>;
  /** 세션별 예약번호 채번 시퀀스 (명세 §2 code 패턴) */
  codeSeq: Map<string, number>;
}

function seed(): MemoryDb {
  const data = seedDataset();
  const toMap = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

  return {
    teachers: toMap(data.teachers),
    classes: toMap(data.classes),
    students: toMap(data.students),
    admin: data.admin,
    sessions: toMap(data.sessions),
    reservations: toMap(data.reservations),
    smsTemplates: toMap(data.smsTemplates),
    smsLogs: toMap(data.smsLogs),
    surveys: toMap(data.surveys),
    devices: toMap(data.devices),
    codeSeq: new Map(data.codeSeq),
  };
}

const g = globalThis as typeof globalThis & { __nprMemoryDb?: MemoryDb };

export function db(): MemoryDb {
  g.__nprMemoryDb ??= seed();
  return g.__nprMemoryDb;
}

/** 테스트·프리뷰 초기화 */
export function resetDb(): void {
  g.__nprMemoryDb = seed();
}

/** 깊은 복사로 반환 — 호출부가 스토어 내부를 실수로 변형하지 못하게 (DB 구현과 동작을 맞춘다) */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
