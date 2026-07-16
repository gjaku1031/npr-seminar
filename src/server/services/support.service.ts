import "server-only";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User, UserRole } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import { summarize, type SurveyDraft, type SurveyResponse, type SurveySummary } from "@/entities/survey";
import type { CounselBooking, CounselBookingDraft, CounselSlot } from "@/entities/counsel";
import type { Device } from "@/entities/device";
import {
  classRepository,
  counselRepository,
  deviceRepository,
  smsRepository,
  surveyRepository,
  teacherRepository,
  userRepository,
} from "../repositories";

/**
 * 부가 도메인 유스케이스 — 반·강사·사용자·문자·설문·상담·기기.
 *
 * 범위(2026-07-16 결정): 이번 뼈대는 **시그니처와 조회 경로**까지다.
 * 화면별 조작(문자 발송 대상 산출, 설문 발송, 상담 슬롯 관리 등)은 해당 모듈 구현 시 채운다.
 */

// ── 반·강사 (필터·배정에 쓰이는 참조 데이터) ──────────────
export async function listClasses(): Promise<Class[]> {
  return classRepository.list();
}

export async function listClassesByTeacher(teacherId: string): Promise<Class[]> {
  return classRepository.listByTeacher(teacherId);
}

export async function listTeachers(): Promise<Teacher[]> {
  return teacherRepository.list();
}

// ── 사용자·역할 (명세 12.1) ───────────────────────────────
/** 역할 선택 로그인 — 실제 인증 도입 시 이 함수가 세션 발급으로 승격된다 (설계 §8) */
export async function listUsersByRole(role: UserRole): Promise<User[]> {
  return userRepository.listByRole(role);
}

// ── 문자 (명세 §6) ────────────────────────────────────────
export async function listSmsTemplates(): Promise<SmsTemplate[]> {
  return smsRepository.listTemplates();
}

export async function createSmsTemplate(name: string, body: string): Promise<SmsTemplate> {
  return smsRepository.createTemplate(name, body);
}

export async function saveSmsTemplate(id: string, body: string): Promise<SmsTemplate> {
  return smsRepository.saveTemplate(id, body);
}

export async function listSmsLogs(): Promise<SmsLog[]> {
  return smsRepository.listLogs();
}

/**
 * 발송 — ⚠️ 실제 게이트웨이 미연동 (명세 §11). 지금은 로그 적재까지.
 * 게이트웨이 연동 시 이 함수 내부만 바뀐다: 발송 호출 → 결과로 ok/fail 채움.
 */
export async function sendSms(input: {
  templateName: string;
  sessionTitle: string;
  recipients: number;
  auto?: boolean;
}): Promise<SmsLog> {
  return smsRepository.addLog({
    when: new Date(),
    to: input.recipients,
    template: input.templateName,
    session: input.sessionTitle,
    ok: input.recipients,
    fail: 0,
    auto: input.auto ?? false,
  });
}

// ── 설문 (명세 12.7) ──────────────────────────────────────
export async function listSurveyResponses(sessionId: string): Promise<SurveyResponse[]> {
  return surveyRepository.listBySession(sessionId);
}

export async function getSurveySummary(sessionId: string): Promise<SurveySummary> {
  return summarize(await surveyRepository.listBySession(sessionId));
}

export async function submitSurvey(draft: SurveyDraft): Promise<SurveyResponse> {
  return surveyRepository.create(draft);
}

// ── 상담 (명세 12.10) ─────────────────────────────────────
export async function listCounselSlots(teacherId?: string): Promise<CounselSlot[]> {
  return counselRepository.listSlots(teacherId);
}

export async function listCounselBookings(teacherId?: string): Promise<CounselBooking[]> {
  return counselRepository.listBookings(teacherId);
}

/** 슬롯 점유와 신청 생성의 원자성은 리포지토리 구현 책임 (설계 §8) */
export async function bookCounsel(draft: CounselBookingDraft): Promise<CounselBooking> {
  return counselRepository.book(draft);
}

// ── QR 스캐너 기기 (명세 §8.1) ────────────────────────────
export async function listDevices(): Promise<Device[]> {
  return deviceRepository.list();
}
