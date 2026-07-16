import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import {
  classes,
  counselBookings,
  counselSlots,
  devices,
  smsLogs,
  smsTemplates,
  surveyResponses,
  teachers,
  users,
} from "../../db/schema";
import type {
  ClassRepository,
  CounselRepository,
  DeviceRepository,
  SmsRepository,
  SurveyRepository,
  TeacherRepository,
  UserRepository,
} from "../support.port";

/** 부가 도메인 drizzle 구현 — 조작이 단순해 한 파일에 모았다 (support.port.ts와 대칭). */

export const drizzleClassRepository: ClassRepository = {
  async list() {
    return getDb().select().from(classes);
  },
  async findById(id) {
    const rows = await getDb().select().from(classes).where(eq(classes.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async listByTeacher(teacherId) {
    return getDb().select().from(classes).where(eq(classes.teacherId, teacherId));
  },
};

export const drizzleTeacherRepository: TeacherRepository = {
  async list() {
    return getDb().select().from(teachers);
  },
  async findById(id) {
    const rows = await getDb().select().from(teachers).where(eq(teachers.id, id)).limit(1);
    return rows[0] ?? null;
  },
};

export const drizzleUserRepository: UserRepository = {
  async listByRole(role) {
    const rows = await getDb()
      .select({ role: users.role, name: users.name, teacherId: users.teacherId })
      .from(users)
      .where(and(eq(users.role, role), eq(users.active, true)));
    return rows;
  },
  async findById(id) {
    const rows = await getDb()
      .select({ role: users.role, name: users.name, teacherId: users.teacherId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  },
};

export const drizzleSmsRepository: SmsRepository = {
  async listTemplates() {
    return getDb().select().from(smsTemplates);
  },
  async createTemplate(name, body) {
    const rows = await getDb().insert(smsTemplates).values({ name, body }).returning();
    return rows[0];
  },
  async saveTemplate(id, body) {
    const rows = await getDb()
      .update(smsTemplates)
      .set({ body })
      .where(eq(smsTemplates.id, id))
      .returning();
    if (!rows[0]) throw new Error(`템플릿을 찾을 수 없습니다: ${id}`);
    return rows[0];
  },
  async listLogs() {
    return getDb().select().from(smsLogs).orderBy(desc(smsLogs.when));
  },
  async addLog(log) {
    const rows = await getDb().insert(smsLogs).values(log).returning();
    return rows[0];
  },
};

export const drizzleSurveyRepository: SurveyRepository = {
  async listBySession(sessionId) {
    const rows = await getDb()
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.sessionId, sessionId));
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      rating: r.rating,
      helpful: r.helpful,
      again: r.again,
      comment: r.comment,
    }));
  },
  async create(draft) {
    const rows = await getDb().insert(surveyResponses).values(draft).returning();
    const r = rows[0];
    return {
      id: r.id,
      sessionId: r.sessionId,
      rating: r.rating,
      helpful: r.helpful,
      again: r.again,
      comment: r.comment,
    };
  },
};

export const drizzleCounselRepository: CounselRepository = {
  async listSlots(teacherId) {
    const q = getDb().select().from(counselSlots);
    return teacherId ? q.where(eq(counselSlots.teacherId, teacherId)) : q;
  },
  async listBookings(teacherId) {
    const q = getDb().select().from(counselBookings);
    return teacherId ? q.where(eq(counselBookings.teacherId, teacherId)) : q;
  },
  /**
   * 슬롯 점유 + 신청 생성.
   * 슬롯 갱신을 `booked=false` 조건부로 걸어 이중 예약을 DB가 거른다 —
   * neon-http에 대화형 트랜잭션이 없어도 경합에서 한 명만 성공한다 (설계 §8).
   */
  async book(draft) {
    const claimed = await getDb()
      .update(counselSlots)
      .set({ booked: true })
      .where(and(eq(counselSlots.id, draft.slotId), eq(counselSlots.booked, false)))
      .returning();
    const slot = claimed[0];
    if (!slot) throw new Error("이미 예약되었거나 존재하지 않는 상담 슬롯입니다.");

    const rows = await getDb()
      .insert(counselBookings)
      .values({
        slotId: slot.id,
        teacherId: slot.teacherId,
        date: slot.date,
        time: slot.time,
        name: draft.name,
        grade: draft.grade,
        phone: draft.phone,
        from: draft.from,
      })
      .returning();
    return rows[0];
  },
};

export const drizzleDeviceRepository: DeviceRepository = {
  async list() {
    return getDb().select().from(devices);
  },
  async findById(id) {
    const rows = await getDb().select().from(devices).where(eq(devices.id, id)).limit(1);
    return rows[0] ?? null;
  },
};
