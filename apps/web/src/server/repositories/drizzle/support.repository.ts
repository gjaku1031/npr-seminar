import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { classes, devices, smsLogs, smsTemplates, surveyResponses, teachers, users } from "../../db/schema";
import type { Class } from "@/entities/class";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type { Device } from "@/entities/device";
import type {
  ClassRepository,
  DeviceRepository,
  SmsRepository,
  SurveyRepository,
  TeacherRepository,
  UserRepository,
} from "../support.port";

/** Row→도메인 변환들 — DB 전용 컬럼(createdAt 등)은 도메인으로 새어나가지 않는다 */

type ClassRow = typeof classes.$inferSelect;
function toClass(row: ClassRow): Class {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacherId,
    teacherName: row.teacherName,
    campus: row.campus,
    unit: row.unit,
  };
}

type SurveyRow = typeof surveyResponses.$inferSelect;
function toSurvey(row: SurveyRow): SurveyResponse {
  return {
    id: row.id,
    sessionId: row.sessionId,
    campus: row.campus,
    unit: row.unit,
    student: row.student,
    className: row.className,
    teacherName: row.teacherName,
    phone: row.phone,
    rating: row.rating,
    comment: row.comment,
    photo: row.photo,
    photoName: row.photoName ?? undefined,
    createdAt: row.createdAt,
  };
}

type SmsLogRow = typeof smsLogs.$inferSelect;
function toSmsLog(row: SmsLogRow): SmsLog {
  return {
    id: row.id,
    when: row.when,
    to: row.to,
    template: row.template,
    session: row.session,
    campus: row.campus,
    ok: row.ok,
    fail: row.fail,
    auto: row.auto,
  };
}

type DeviceRow = typeof devices.$inferSelect;
function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    label: row.label,
    model: row.model,
    scannerNo: row.scannerNo,
    on: row.on,
    battery: row.battery,
    last: row.last,
  };
}

export const drizzleClassRepository: ClassRepository = {
  async list() {
    const rows = await getDb().select().from(classes);
    return rows.map(toClass);
  },
  async findById(id) {
    const rows = await getDb().select().from(classes).where(eq(classes.id, id)).limit(1);
    return rows[0] ? toClass(rows[0]) : null;
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
  /** 단일 관리자 (명세 §1.1) — 시드 행이 없어도 기본값을 보장한다 */
  async getAdmin() {
    const rows = await getDb().select().from(users).where(eq(users.role, "admin")).limit(1);
    return rows[0] ? { role: rows[0].role, name: rows[0].name } : { role: "admin", name: "관리자" };
  },
};

export const drizzleSmsRepository: SmsRepository = {
  async listTemplates() {
    return getDb().select().from(smsTemplates);
  },
  async createTemplate(name, body) {
    const rows = await getDb().insert(smsTemplates).values({ name, body }).returning();
    return rows[0] as SmsTemplate;
  },
  async saveTemplate(id, body) {
    const rows = await getDb()
      .update(smsTemplates)
      .set({ body })
      .where(eq(smsTemplates.id, id))
      .returning();
    if (!rows[0]) throw new Error(`템플릿을 찾을 수 없습니다: ${id}`);
    return rows[0] as SmsTemplate;
  },
  async deleteTemplate(id) {
    await getDb().delete(smsTemplates).where(eq(smsTemplates.id, id));
  },
  async countTemplates() {
    const [{ count }] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(smsTemplates);
    return count;
  },
  async listLogs() {
    const rows = await getDb().select().from(smsLogs).orderBy(desc(smsLogs.when));
    return rows.map(toSmsLog);
  },
  async addLog(log) {
    const rows = await getDb().insert(smsLogs).values(log).returning();
    return toSmsLog(rows[0]);
  },
};

export const drizzleSurveyRepository: SurveyRepository = {
  async listBySession(sessionId) {
    const rows = await getDb()
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.sessionId, sessionId))
      .orderBy(desc(surveyResponses.createdAt));
    return rows.map(toSurvey);
  },
  async create(draft) {
    const rows = await getDb().insert(surveyResponses).values(draft).returning();
    return toSurvey(rows[0]);
  },
};

export const drizzleDeviceRepository: DeviceRepository = {
  async list() {
    const rows = await getDb().select().from(devices).orderBy(asc(devices.scannerNo));
    return rows.map(toDevice);
  },
  async findById(id) {
    const rows = await getDb().select().from(devices).where(eq(devices.id, id)).limit(1);
    return rows[0] ? toDevice(rows[0]) : null;
  },
};
