import "server-only";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import { summarize, type SurveyDraft, type SurveyResponse, type SurveySummary } from "@/entities/survey";
import type { Device } from "@/entities/device";
import type { Reservation, SmsTargetGroup } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Campus, CampusScope } from "@/shared/config/campus";
import {
  classRepository,
  deviceRepository,
  reservationRepository,
  sessionRepository,
  smsRepository,
  surveyRepository,
  teacherRepository,
  userRepository,
} from "../repositories";
import { sendSmsBatch } from "../sms/gateway";
import { renderSmsBody, reservationVars } from "../sms/template";
import { InvalidStateError, NotFoundError } from "./errors";

/**
 * 부가 도메인 유스케이스 — 반·강사·사용자·문자·설문·기기.
 * v4.0: 상담(counsel) 보류. 문자 템플릿 삭제(마지막 1개 보호)·캠퍼스 로그 추가 (명세 §5).
 */

// ── 반·강사 (필터에 쓰이는 참조 데이터) ──────────────────
export async function listClasses(): Promise<Class[]> {
  return classRepository.list();
}

export async function listTeachers(): Promise<Teacher[]> {
  return teacherRepository.list();
}

// ── 사용자 (명세 §1.1 단일 관리자) ────────────────────────
export async function getAdminUser(): Promise<User> {
  return userRepository.getAdmin();
}

// ── 문자 (명세 §5) ────────────────────────────────────────
export async function listSmsTemplates(): Promise<SmsTemplate[]> {
  return smsRepository.listTemplates();
}

export async function createSmsTemplate(name: string, body: string): Promise<SmsTemplate> {
  return smsRepository.createTemplate(name, body);
}

export async function saveSmsTemplate(id: string, body: string): Promise<SmsTemplate> {
  return smsRepository.saveTemplate(id, body);
}

/** 템플릿 삭제 — 마지막 1개는 보호한다 (명세 §5.1) */
export async function deleteSmsTemplate(id: string): Promise<void> {
  const count = await smsRepository.countTemplates();
  if (count <= 1) throw new InvalidStateError("마지막 템플릿은 삭제할 수 없습니다.");
  return smsRepository.deleteTemplate(id);
}

export async function listSmsLogs(): Promise<SmsLog[]> {
  return smsRepository.listLogs();
}

/**
 * 발송 실행 + 로그 적재 — SOLAPI 게이트웨이 연동 (명세 §12 실서비스 전환, qr-poc 이식).
 * 수신자별 변수 치환 본문을 배치 발송하고 결과(ok/fail)를 로그로 남긴다 (명세 §5.4).
 * ok 집계: 게이트웨이 비활성(로컬·키 없음)의 skip은 목업 시절과 동일하게 성공으로 취급한다.
 */
async function sendAndRecord(input: {
  templateName: string;
  session: Session;
  body: string;
  recipients: Reservation[];
  campus: CampusScope;
  auto?: boolean;
}): Promise<SmsLog> {
  if (input.recipients.length <= 0) throw new InvalidStateError("발송 대상이 없습니다.");

  const result = await sendSmsBatch(
    input.recipients.map((r) => ({
      to: r.phone,
      body: renderSmsBody(input.body, reservationVars(r, input.session)),
    })),
  );

  return smsRepository.addLog({
    when: new Date(),
    to: input.recipients.length,
    template: input.templateName,
    session: input.session.title,
    campus: input.campus,
    ok: result.sent + result.skipped,
    fail: result.failed,
    auto: input.auto ?? false,
  });
}

/**
 * 그룹 문자 발송 (명세 §5.2) — 대상 = 설명회 × 그룹(예약자 전체/미체크만/입장 완료/취소자) × 캠퍼스.
 * 수신 인원은 서버가 산출한다(클라이언트 카운트 신뢰 금지). 본문 변수는 수신자별 치환 (명세 §5.1).
 */
export async function sendGroupSms(input: {
  sessionId: string;
  group: SmsTargetGroup;
  campus: Campus;
  templateName: string;
  body: string;
}): Promise<SmsLog> {
  const session = await sessionRepository.findById(input.sessionId);
  if (!session) throw new NotFoundError("설명회를 찾을 수 없습니다.");

  const rows = (await reservationRepository.listBySession(input.sessionId)).filter(
    (r) => r.campus === input.campus,
  );
  const recipients =
    input.group === "all"
      ? rows.filter((r) => r.status !== "cancelled")
      : rows.filter((r) => r.status === input.group);

  return sendAndRecord({
    templateName: input.templateName,
    session,
    body: input.body,
    recipients,
    campus: input.campus,
  });
}

/** 만족도 설문 발송 (명세 §6.4) — 대상 = 참석(입장 완료) 학부모 전체, 로그 campus '전체' */
export async function sendSurveySms(sessionId: string): Promise<SmsLog> {
  const session = await sessionRepository.findById(sessionId);
  if (!session) throw new NotFoundError("설명회를 찾을 수 없습니다.");

  const entered = (await reservationRepository.listBySession(sessionId)).filter(
    (r) => r.status === "entered",
  );

  return sendAndRecord({
    templateName: "만족도 설문 요청",
    session,
    body: session.surveySms,
    recipients: entered,
    campus: "전체",
  });
}

// ── 설문 (명세 §6.4~6.5 · §10.9) ─────────────────────────
export async function listSurveyResponses(sessionId: string): Promise<SurveyResponse[]> {
  return surveyRepository.listBySession(sessionId);
}

export async function getSurveySummary(sessionId: string): Promise<SurveySummary> {
  return summarize(await surveyRepository.listBySession(sessionId));
}

export async function submitSurvey(draft: SurveyDraft): Promise<SurveyResponse> {
  return surveyRepository.create(draft);
}

/**
 * 모바일 설문 제출 (명세 §10.9) — 예약을 알면 캠퍼스·단위·반·담임 스냅샷을 서버가 채운다.
 * 예약 없이(목록 하단 링크 진입) 제출하면 익명 '참석 학부모'로 저장한다.
 */
export async function submitMobileSurvey(input: {
  sessionId: string;
  rating: SurveyDraft["rating"];
  comment: string;
  photo: boolean;
  reservationId?: string | null;
}): Promise<SurveyResponse> {
  const base = input.reservationId
    ? await reservationRepository.findById(input.reservationId)
    : null;
  return surveyRepository.create({
    sessionId: input.sessionId,
    campus: base?.campus ?? "",
    unit: base?.unit ?? "",
    student: base?.name ?? "참석 학부모",
    className: base?.className ?? "",
    teacherName: base?.teacherName ?? "",
    phone: base?.phone ?? "",
    rating: input.rating,
    comment: input.comment,
    photo: input.photo,
    photoName: input.photo ? `현장사진_${String(Date.now()).slice(-4)}.jpg` : undefined,
  });
}

// ── QR 스캐너 기기 (명세 §9.1) ────────────────────────────
export async function listDevices(): Promise<Device[]> {
  return deviceRepository.list();
}
