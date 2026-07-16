import "server-only";
import { resolveRepoImpl } from "../config/env";

import { drizzleSessionRepository } from "./drizzle/session.repository";
import { drizzleReservationRepository } from "./drizzle/reservation.repository";
import { drizzleStudentRepository } from "./drizzle/student.repository";
import {
  drizzleClassRepository,
  drizzleCounselRepository,
  drizzleDeviceRepository,
  drizzleSmsRepository,
  drizzleSurveyRepository,
  drizzleTeacherRepository,
  drizzleUserRepository,
} from "./drizzle/support.repository";

import { memorySessionRepository } from "./memory/session.repository";
import { memoryReservationRepository } from "./memory/reservation.repository";
import { memoryStudentRepository } from "./memory/student.repository";
import {
  memoryClassRepository,
  memoryCounselRepository,
  memoryDeviceRepository,
  memorySmsRepository,
  memorySurveyRepository,
  memoryTeacherRepository,
  memoryUserRepository,
} from "./memory/support.repository";

import type { SessionRepository } from "./session.port";
import type { ReservationRepository } from "./reservation.port";
import type { StudentRepository } from "./student.port";
import type {
  ClassRepository,
  CounselRepository,
  DeviceRepository,
  SmsRepository,
  SurveyRepository,
  TeacherRepository,
  UserRepository,
} from "./support.port";

/**
 * ★ 조립(교체) 지점 (설계 §6.1-③) ★
 * 구현 선택은 이 파일이 전담한다 — 다른 어디서도 구현을 직접 import하지 않는다(ESLint R3).
 * DB 교체 시: 새 구현 폴더 추가 → 아래 pick() 대상만 변경. 상위 레이어(services·features·app)는 모른다.
 *
 * 모든 도메인이 drizzle·memory 두 구현을 갖는다 — memory는 데모용이 아니라
 * "계약만으로 전 기능이 돈다"는 상시 증명이다 (설계 §6.3 · §10).
 */
const impl = resolveRepoImpl();

/** 두 구현 중 하나를 고른다. 도메인마다 반복되는 삼항을 한 곳으로 모아 실수를 막는다. */
const pick = <T>(drizzle: T, memory: T): T => (impl === "memory" ? memory : drizzle);

export const sessionRepository: SessionRepository = pick(
  drizzleSessionRepository,
  memorySessionRepository,
);
export const reservationRepository: ReservationRepository = pick(
  drizzleReservationRepository,
  memoryReservationRepository,
);
export const studentRepository: StudentRepository = pick(
  drizzleStudentRepository,
  memoryStudentRepository,
);
export const classRepository: ClassRepository = pick(drizzleClassRepository, memoryClassRepository);
export const teacherRepository: TeacherRepository = pick(
  drizzleTeacherRepository,
  memoryTeacherRepository,
);
export const userRepository: UserRepository = pick(drizzleUserRepository, memoryUserRepository);
export const smsRepository: SmsRepository = pick(drizzleSmsRepository, memorySmsRepository);
export const surveyRepository: SurveyRepository = pick(
  drizzleSurveyRepository,
  memorySurveyRepository,
);
export const counselRepository: CounselRepository = pick(
  drizzleCounselRepository,
  memoryCounselRepository,
);
export const deviceRepository: DeviceRepository = pick(drizzleDeviceRepository, memoryDeviceRepository);

export type { SessionRepository } from "./session.port";
export type { ReservationRepository, DuplicateKey } from "./reservation.port";
export type { StudentRepository, StudentQuery } from "./student.port";
export type {
  ClassRepository,
  TeacherRepository,
  UserRepository,
  SmsRepository,
  SurveyRepository,
  CounselRepository,
  DeviceRepository,
} from "./support.port";
