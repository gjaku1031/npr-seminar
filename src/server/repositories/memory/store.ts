import "server-only";
import type { Session } from "@/entities/session";
import type { Reservation } from "@/entities/reservation";
import type { Student } from "@/entities/student";
import type { Class } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type { CounselBooking, CounselSlot } from "@/entities/counsel";
import type { Device } from "@/entities/device";

/**
 * 인메모리 스토어 — 설계 §6.3의 "교체 가능성 상시 증명" 장치이자 DB 없는 로컬 구동 수단.
 * 데모 편의가 아니라 설계 검증용이다: 계약(port)만으로 전 기능이 도는지 상시 확인한다.
 *
 * globalThis 캐시: Next dev의 모듈 재평가(HMR)에도 데이터가 유지되도록.
 * 와이어프레임 store(명세 §2)와 같은 시드 규모(재원생 40명·강사 4명)를 재현한다.
 */

export interface MemoryDb {
  teachers: Map<string, Teacher>;
  classes: Map<string, Class>;
  students: Map<string, Student>;
  users: Map<string, User & { id: string }>;
  sessions: Map<string, Session>;
  reservations: Map<string, Reservation>;
  smsTemplates: Map<string, SmsTemplate>;
  smsLogs: Map<string, SmsLog>;
  surveys: Map<string, SurveyResponse>;
  counselSlots: Map<string, CounselSlot>;
  counselBookings: Map<string, CounselBooking>;
  devices: Map<string, Device>;
  /** 세션별 예약번호 채번 시퀀스 (명세 §2 code 패턴) */
  codeSeq: Map<string, number>;
}

/** 시드용 결정적 id — 새로고침해도 같은 id를 유지해 링크가 깨지지 않게 한다 */
const uid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TEACHER = (n: number) => uid("11111111", n);
const CLASS = (n: number) => uid("22222222", n);
const STUDENT = (n: number) => uid("33333333", n);
const SESSION = (n: number) => uid("44444444", n);
const RESERVATION = (n: number) => uid("55555555", n);

const SCHOOLS = ["한빛초", "새롬초", "가온중", "미래중", "청람고", "다온고"];

function seedTeachers(): Teacher[] {
  return ["김수학", "이영어", "박국어", "최과학"].map((name, i) => ({
    id: TEACHER(i + 1),
    name,
  }));
}

function seedClasses(): Class[] {
  return [
    { id: CLASS(1), name: "초등부A", level: "elementary", teacherId: TEACHER(1) },
    { id: CLASS(2), name: "초등부B", level: "elementary", teacherId: TEACHER(2) },
    { id: CLASS(3), name: "중등부A", level: "middle", teacherId: TEACHER(1) },
    { id: CLASS(4), name: "중등부B", level: "middle", teacherId: TEACHER(3) },
    { id: CLASS(5), name: "고등부A", level: "high", teacherId: TEACHER(4) },
    { id: CLASS(6), name: "고등부B", level: "high", teacherId: TEACHER(2) },
  ];
}

const GRADE_BY_LEVEL: Record<string, string[]> = {
  elementary: ["초4", "초5", "초6"],
  middle: ["중1", "중2", "중3"],
  high: ["고1", "고2", "고3"],
};

/** 재원생 40명 (명세 §2 시드 규모) */
function seedStudents(classes: Class[]): Student[] {
  const surnames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
  const givens = ["민준", "서연", "도윤", "하은", "지호", "수아", "예준", "지우"];
  return Array.from({ length: 40 }, (_, i) => {
    const cls = classes[i % classes.length];
    const grades = GRADE_BY_LEVEL[cls.level];
    return {
      id: STUDENT(i + 1),
      name: `${surnames[i % surnames.length]}${givens[i % givens.length]}`,
      school: SCHOOLS[i % SCHOOLS.length],
      grade: grades[i % grades.length],
      classId: cls.id,
      parentPhone: `010-${String(1000 + i).padStart(4, "0")}-${String(2000 + i * 7).slice(0, 4)}`,
      noShowCount: 0,
      convertedFrom: null,
    };
  });
}

function seedSessions(): Session[] {
  return [
    {
      id: SESSION(1),
      title: "2027 대입 전략 설명회",
      date: new Date("2026-08-20T00:00:00+09:00"),
      round: 1,
      time: "10:00",
      place: "본원 3층 대강당",
      capacity: 60,
      desc: "고3 대상 수시·정시 전략 안내",
      attendField: true,
      active: true,
      ended: false,
      reminders: [
        { id: "r1", label: "전일 안내", time: "18:00", template: "리마인드", enabled: true },
        { id: "r2", label: "당일 아침", time: "08:00", template: "리마인드", enabled: false },
      ],
      banner: "navy",
      notice: "주차 공간이 협소하니 대중교통을 이용해 주세요.",
    },
    {
      id: SESSION(2),
      title: "중등 내신 대비 설명회",
      date: new Date("2026-09-05T00:00:00+09:00"),
      round: 2,
      time: "19:00",
      place: "본원 2층 세미나실",
      capacity: 40,
      desc: "중1~중3 학부모 대상",
      attendField: false,
      active: true,
      ended: false,
      reminders: [{ id: "r1", label: "전일 안내", time: "18:00", template: "리마인드", enabled: true }],
      banner: "blue",
      notice: "",
    },
  ];
}

function seedReservations(students: Student[]): Reservation[] {
  const rows: Reservation[] = [];
  // 1회차: 재원생 6명 예약 — 2명은 이미 입장 완료
  for (let i = 0; i < 6; i += 1) {
    const s = students[i];
    rows.push({
      id: RESERVATION(i + 1),
      code: `NPR-SS1-${String(i + 1).padStart(4, "0")}`,
      sessionId: SESSION(1),
      studentId: s.id,
      name: s.name,
      school: s.school,
      grade: s.grade,
      phone: s.parentPhone,
      channel: i % 2 === 0 ? "mobile" : "phone",
      status: i < 2 ? "entered" : "reserved",
      attendCount: 2,
      member: true,
      reservedAt: new Date(`2026-08-0${i + 1}T09:00:00+09:00`),
      history: [],
      codeHistory: [],
      audit: [],
      groupId: null,
      cancelledBy: null,
    });
  }
  // 비재원생 1명 — 전환(12.14) 대상
  rows.push({
    id: RESERVATION(7),
    code: "NPR-SS1-0007",
    sessionId: SESSION(1),
    studentId: null,
    name: "홍길동",
    school: "외부중",
    grade: "중3",
    phone: "010-9999-1234",
    channel: "phone",
    status: "reserved",
    attendCount: 1,
    member: false,
    reservedAt: new Date("2026-08-07T14:20:00+09:00"),
    history: [],
    codeHistory: [],
    audit: [],
    groupId: null,
    cancelledBy: null,
  });
  return rows;
}

function seedDevices(): Device[] {
  return [
    { id: "dev-1", label: "정문 입구", model: "iPad 10", on: true, battery: 82, last: new Date("2026-08-20T09:40:00+09:00") },
    { id: "dev-2", label: "3층 대강당", model: "Galaxy Tab S9", on: true, battery: 35, last: new Date("2026-08-20T09:38:00+09:00") },
    { id: "dev-3", label: "2층 로비", model: "iPad 9", on: false, battery: 100, last: new Date("2026-08-19T18:02:00+09:00") },
  ];
}

function seedCounselSlots(): CounselSlot[] {
  const slots: CounselSlot[] = [];
  const times = ["14:00", "15:00", "16:00"];
  seedTeachers().forEach((t, ti) => {
    times.forEach((time, i) => {
      slots.push({
        id: `slot-${ti + 1}-${i + 1}`,
        teacherId: t.id,
        date: new Date("2026-08-22T00:00:00+09:00"),
        time,
        booked: false,
      });
    });
  });
  return slots;
}

function seed(): MemoryDb {
  const teachers = seedTeachers();
  const classes = seedClasses();
  const students = seedStudents(classes);
  const sessions = seedSessions();
  const reservations = seedReservations(students);

  const toMap = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

  return {
    teachers: toMap(teachers),
    classes: toMap(classes),
    students: toMap(students),
    users: toMap([
      { id: "u-owner", role: "owner", name: "원장", teacherId: null },
      { id: "u-siljang", role: "siljang", name: "실장", teacherId: null },
      { id: "u-gangsa", role: "gangsa", name: "김수학", teacherId: TEACHER(1) },
    ]),
    sessions: toMap(sessions),
    reservations: toMap(reservations),
    smsTemplates: toMap([
      { id: "tpl-1", name: "예약 확정", body: "{학생명} 학생 {설명회명} 예약이 확정되었습니다. {일시} {장소}\n입장 QR: {QR링크}" },
      { id: "tpl-2", name: "전일 리마인드", body: "내일 {일시} {설명회명}이 진행됩니다. {장소}에서 뵙겠습니다." },
    ]),
    smsLogs: new Map(),
    surveys: new Map(),
    counselSlots: toMap(seedCounselSlots()),
    counselBookings: new Map(),
    devices: toMap(seedDevices()),
    codeSeq: new Map([[SESSION(1), 7]]),
  };
}

const g = globalThis as typeof globalThis & { __nprMemoryDb?: MemoryDb };

export function db(): MemoryDb {
  g.__nprMemoryDb ??= seed();
  return g.__nprMemoryDb;
}

/** 테스트·프리뷰 초기화 (명세 §9.3) */
export function resetDb(): void {
  g.__nprMemoryDb = seed();
}

/** 깊은 복사로 반환 — 호출부가 스토어 내부를 실수로 변형하지 못하게 (DB 구현과 동작을 맞춘다) */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
