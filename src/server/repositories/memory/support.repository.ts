import "server-only";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type { CounselBooking } from "@/entities/counsel";
import type {
  ClassRepository,
  CounselRepository,
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
  async listByTeacher(teacherId) {
    return clone([...db().classes.values()].filter((c) => c.teacherId === teacherId));
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
  async listByRole(role) {
    return clone([...db().users.values()].filter((u) => u.role === role));
  },
  async findById(id) {
    const row = db().users.get(id);
    return row ? clone(row) : null;
  },
};

export const memorySmsRepository: SmsRepository = {
  async listTemplates() {
    return clone([...db().smsTemplates.values()]);
  },
  async createTemplate(name, body) {
    const row: SmsTemplate = { id: crypto.randomUUID(), name, body };
    db().smsTemplates.set(row.id, row);
    return clone(row);
  },
  async saveTemplate(id, body) {
    const row = db().smsTemplates.get(id);
    if (!row) throw new Error(`템플릿을 찾을 수 없습니다: ${id}`);
    const next = { ...row, body };
    db().smsTemplates.set(id, next);
    return clone(next);
  },
  async listLogs() {
    return clone([...db().smsLogs.values()].sort((a, b) => b.when.getTime() - a.when.getTime()));
  },
  async addLog(log) {
    const row: SmsLog = { id: crypto.randomUUID(), ...log };
    db().smsLogs.set(row.id, row);
    return clone(row);
  },
};

export const memorySurveyRepository: SurveyRepository = {
  async listBySession(sessionId) {
    return clone([...db().surveys.values()].filter((s) => s.sessionId === sessionId));
  },
  async create(draft) {
    const row: SurveyResponse = { id: crypto.randomUUID(), ...draft };
    db().surveys.set(row.id, row);
    return clone(row);
  },
};

export const memoryCounselRepository: CounselRepository = {
  async listSlots(teacherId) {
    const rows = [...db().counselSlots.values()];
    return clone(teacherId ? rows.filter((s) => s.teacherId === teacherId) : rows);
  },
  async listBookings(teacherId) {
    const rows = [...db().counselBookings.values()];
    return clone(teacherId ? rows.filter((b) => b.teacherId === teacherId) : rows);
  },
  /** 슬롯 점유 + 신청 생성을 함께 (설계 §8 — 원자성은 구현 책임) */
  async book(draft) {
    const store = db();
    const slot = store.counselSlots.get(draft.slotId);
    if (!slot) throw new Error(`상담 슬롯을 찾을 수 없습니다: ${draft.slotId}`);
    if (slot.booked) throw new Error("이미 예약된 상담 슬롯입니다.");

    store.counselSlots.set(slot.id, { ...slot, booked: true });
    const row: CounselBooking = {
      id: crypto.randomUUID(),
      slotId: slot.id,
      teacherId: slot.teacherId,
      date: slot.date,
      time: slot.time,
      name: draft.name,
      grade: draft.grade,
      phone: draft.phone,
      from: draft.from,
    };
    store.counselBookings.set(row.id, row);
    return clone(row);
  },
};

export const memoryDeviceRepository: DeviceRepository = {
  async list() {
    return clone([...db().devices.values()]);
  },
  async findById(id) {
    const row = db().devices.get(id);
    return row ? clone(row) : null;
  },
};
