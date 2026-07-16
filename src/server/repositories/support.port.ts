import "server-only";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyDraft, SurveyResponse } from "@/entities/survey";
import type { Device } from "@/entities/device";

/**
 * 부가 도메인 계약 — 반·강사·사용자·문자·설문·기기.
 * 핵심 3종(session·reservation·student)과 달리 조작이 단순해 한 파일에 모았다.
 *
 * v4.0: 상담(Counsel) 도메인 보류 — 간담회는 placeholder 화면만 (명세 §7).
 * 문자 템플릿 삭제 추가 (명세 §5.1), 설문은 v4.0 응답 모델로 개편 (명세 §6.5).
 */

export interface ClassRepository {
  list(): Promise<Class[]>;
  findById(id: string): Promise<Class | null>;
}

export interface TeacherRepository {
  list(): Promise<Teacher[]>;
  findById(id: string): Promise<Teacher | null>;
}

export interface UserRepository {
  /** 단일 관리자 계정 (명세 §1.1) — 실제 인증 도입 시 이 계약이 확장된다 (설계 §8) */
  getAdmin(): Promise<User>;
}

export interface SmsRepository {
  listTemplates(): Promise<SmsTemplate[]>;
  createTemplate(name: string, body: string): Promise<SmsTemplate>;
  saveTemplate(id: string, body: string): Promise<SmsTemplate>;
  /** 템플릿 삭제 (명세 §5.1 — 마지막 1개 보호는 서비스 불변식) */
  deleteTemplate(id: string): Promise<void>;
  countTemplates(): Promise<number>;
  listLogs(): Promise<SmsLog[]>;
  addLog(log: Omit<SmsLog, "id">): Promise<SmsLog>;
}

export interface SurveyRepository {
  listBySession(sessionId: string): Promise<SurveyResponse[]>;
  create(draft: SurveyDraft): Promise<SurveyResponse>;
}

export interface DeviceRepository {
  list(): Promise<Device[]>;
  findById(id: string): Promise<Device | null>;
}
