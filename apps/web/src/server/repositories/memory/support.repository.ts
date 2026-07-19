import "server-only";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type {
  ClassRepository,
  DeviceRepository,
  SmsRepository,
  SurveyRepository,
  TeacherRepository,
  UserRepository,
} from "../support.port";
import { clone, db } from "./store";

export const memoryClassRepository: ClassRepository = {
  async list() {
    return clone([...db().classes.values()]);
  },
  async findById(id) {
    const row = db().classes.get(id);
    return row ? clone(row) : null;
  },
};

export const memoryTeacherRepository: TeacherRepository = {
  async list() {
    return clone([...db().teachers.values()]);
  },
  async findById(id) {
    const row = db().teachers.get(id);
    return row ? clone(row) : null;
  },
};

export const memoryUserRepository: UserRepository = {
  /** 단일 관리자 (명세 §1.1) */
  async getAdmin() {
    return clone(db().admin);
  },
};

export const memorySmsRepository: SmsRepository = {
  async listTemplates() {
    return clone([...db().smsTemplates.values()]);
  },
  async createTemplate(name, body) {
    const t: SmsTemplate = { id: crypto.randomUUID(), name, body };
    db().smsTemplates.set(t.id, t);
    return clone(t);
  },
  async saveTemplate(id, body) {
    const row = db().smsTemplates.get(id);
    if (!row) throw new Error(`템플릿을 찾을 수 없습니다: ${id}`);
    const next = { ...row, body };
    db().smsTemplates.set(id, next);
    return clone(next);
  },
  async deleteTemplate(id) {
    db().smsTemplates.delete(id);
  },
  async countTemplates() {
    return db().smsTemplates.size;
  },
  async listLogs() {
    return clone([...db().smsLogs.values()].sort((a, b) => b.when.getTime() - a.when.getTime()));
  },
  async addLog(log) {
    const row: SmsLog = { ...log, id: crypto.randomUUID() };
    db().smsLogs.set(row.id, row);
    return clone(row);
  },
};

export const memorySurveyRepository: SurveyRepository = {
  async listBySession(sessionId) {
    return clone(
      [...db().surveys.values()]
        .filter((s) => s.sessionId === sessionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  },
  async create(draft) {
    const row: SurveyResponse = { ...draft, id: crypto.randomUUID(), createdAt: new Date() };
    db().surveys.set(row.id, row);
    return clone(row);
  },
};

export const memoryDeviceRepository: DeviceRepository = {
  async list() {
    return clone([...db().devices.values()].sort((a, b) => a.scannerNo - b.scannerNo));
  },
  async findById(id) {
    const row = db().devices.get(id);
    return row ? clone(row) : null;
  },
};
