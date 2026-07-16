import "server-only";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User, UserRole } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyDraft, SurveyResponse } from "@/entities/survey";
import type { CounselBooking, CounselBookingDraft, CounselSlot } from "@/entities/counsel";
import type { Device } from "@/entities/device";

/**
 * 부가 도메인 계약 — 반·강사·사용자·문자·설문·상담·기기.
 * 핵심 3종(session·reservation·student)과 달리 조작이 단순해 한 파일에 모았다.
 * 조작이 늘어나면 도메인별 파일로 분리한다 (설계 §10 절차는 동일).
 */

export interface ClassRepository {
  list(): Promise<Class[]>;
  findById(id: string): Promise<Class | null>;
  /** 담당 강사의 반 — 강사 모니터링 (명세 §4.5) */
  listByTeacher(teacherId: string): Promise<Class[]>;
}

export interface TeacherRepository {
  list(): Promise<Teacher[]>;
  findById(id: string): Promise<Teacher | null>;
}

export interface UserRepository {
  /** 역할 선택 로그인 (명세 12.1) — 실제 인증 도입 시 이 계약이 확장된다 (설계 §8) */
  listByRole(role: UserRole): Promise<User[]>;
  findById(id: string): Promise<User | null>;
}

export interface SmsRepository {
  listTemplates(): Promise<SmsTemplate[]>;
  createTemplate(name: string, body: string): Promise<SmsTemplate>;
  saveTemplate(id: string, body: string): Promise<SmsTemplate>;
  listLogs(): Promise<SmsLog[]>;
  addLog(log: Omit<SmsLog, "id">): Promise<SmsLog>;
}

export interface SurveyRepository {
  listBySession(sessionId: string): Promise<SurveyResponse[]>;
  create(draft: SurveyDraft): Promise<SurveyResponse>;
}

export interface CounselRepository {
  listSlots(teacherId?: string): Promise<CounselSlot[]>;
  listBookings(teacherId?: string): Promise<CounselBooking[]>;
  /** 슬롯 예약 — 슬롯 booked=true + 신청 생성이 원자적이어야 한다 (설계 §8) */
  book(draft: CounselBookingDraft): Promise<CounselBooking>;
}

export interface DeviceRepository {
  list(): Promise<Device[]>;
  findById(id: string): Promise<Device | null>;
}
