import "server-only";
import type { Session } from "@/entities/session";
import type { Reservation, ReservationSource, ReservationStatus, ReservedBy } from "@/entities/reservation";
import type { Student } from "@/entities/student";
import type { Class } from "@/entities/class";
import { unitOf } from "@/entities/class";
import type { Teacher } from "@/entities/teacher";
import type { User } from "@/entities/user";
import type { SmsLog, SmsTemplate } from "@/entities/sms";
import type { SurveyResponse } from "@/entities/survey";
import type { Device } from "@/entities/device";
import type { Campus } from "@/shared/config/campus";

/**
 * 시드 데이터셋 — v4.0 와이어프레임(ui_kits/npr-admin/data.js v3) 포팅.
 * 캠퍼스 3곳 · 담임 6명 · 반 18개 · 재원생 30명 · 단일 설명회(8/21 11:00) ·
 * 예약 17건(입장 5 · 미체크 10 · 취소 2) · 설문 6건 · 스캐너 4대 · 템플릿 4종.
 *
 * memory 스토어(repositories/memory/store.ts)와 DB 시드 스크립트(scripts/seed.ts)가
 * 같은 데이터셋을 쓴다 — 로컬(메모리)과 Neon(drizzle)의 화면이 동일해진다.
 * (시드 스크립트는 react-server 조건으로 실행해 server-only를 통과한다 — package.json db:seed)
 */

export interface SeedDataset {
  teachers: Teacher[];
  classes: Class[];
  students: Student[];
  admin: User;
  sessions: Session[];
  reservations: Reservation[];
  smsTemplates: SmsTemplate[];
  smsLogs: SmsLog[];
  surveys: SurveyResponse[];
  devices: Device[];
  /** 세션별 예약번호 채번 시퀀스 (명세 §2 code 패턴) */
  codeSeq: Array<[sessionId: string, seq: number]>;
}

/** 시드용 결정적 id — 새로고침해도 같은 id를 유지해 링크가 깨지지 않게 한다 (z.uuid() 통과 형식) */
const uid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const TEACHER = (n: number) => uid("11111111", n);
const CLASS = (n: number) => uid("22222222", n);
const STUDENT = (n: number) => uid("33333333", n);
export const SEED_SESSION_ID = uid("44444444", 1);
const SESSION = () => SEED_SESSION_ID;
const RESERVATION = (n: number) => uid("55555555", n);
const SURVEY = (n: number) => uid("66666666", n);
const DEVICE = (n: number) => uid("77777777", n);
const TEMPLATE = (n: number) => uid("88888888", n);
/** 시드 QR 토큰 — 결정적이라 재시드해도 문자·링크의 QR이 깨지지 않는다 */
const QR_TOKEN = (n: number) => uid("aaaaaaaa", n);

/** "07/12(일) 10:23:41" 류의 와이어프레임 시각 → 2026년 KST Date */
const at = (md: string, hms = "09:00:00") => new Date(`2026-${md}T${hms}+09:00`);

function seedTeachers(): Teacher[] {
  return ["김민서", "박준영", "이도현", "한지원", "오세라", "남기태"].map((name, i) => ({
    id: TEACHER(i + 1),
    name,
  }));
}

/** 반 18개 — 반명이 단위를 결정한다 (명세 §2.1) */
function seedClasses(teachers: Teacher[]): Class[] {
  const tn = (n: number) => teachers[n - 1].name;
  const rows: Array<[string, number, Campus]> = [
    ["고1A", 1, "송파캠퍼스"],
    ["고2A", 1, "송파캠퍼스"],
    ["1A", 2, "송파캠퍼스"],
    ["2A", 2, "송파캠퍼스"],
    ["초3A", 3, "송파캠퍼스"],
    ["4A", 3, "송파캠퍼스"],
    ["중1S", 4, "송파캠퍼스"],
    ["과고1A", 4, "송파캠퍼스"],
    ["고1B", 5, "위례캠퍼스"],
    ["3B", 5, "위례캠퍼스"],
    ["5B", 6, "위례캠퍼스"],
    ["중2S", 6, "위례캠퍼스"],
    ["과1B", 5, "위례캠퍼스"],
    ["고3C", 6, "광진캠퍼스"],
    ["2C", 4, "광진캠퍼스"],
    ["6C", 2, "광진캠퍼스"],
    ["초6T", 3, "광진캠퍼스"],
    ["과2C", 1, "광진캠퍼스"],
  ];
  return rows.map(([name, t, campus], i) => ({
    id: CLASS(i + 1),
    name,
    teacherId: TEACHER(t),
    teacherName: tn(t),
    campus,
    unit: unitOf(name),
  }));
}

/** 학년 표기 — 반명 기반 (와이어프레임 gradeOf 이식) */
function gradeOf(className: string): string {
  const u = unitOf(className);
  const digit = (className.match(/\d/) ?? ["1"])[0];
  if (u === "고등" || (u === "과학" && className.indexOf("과고") === 0)) return `고${digit}`;
  if (u === "초등" || (u === "특목" && className.indexOf("초") === 0)) return `초${digit}`;
  return `중${digit}`;
}

/** 재원생 30명 — 학번·모/부 연락처·캠퍼스·담임 (와이어프레임 시드 규칙 그대로) */
function seedStudents(classes: Class[]): Student[] {
  const NAMES = [
    "김수민", "이서연", "박도윤", "최지우", "정하은", "강민준", "조은우", "윤서아", "임시우", "한예린",
    "오지호", "서다인", "신재이", "권보라", "황민재", "송지안", "전유나", "홍성민", "문채원", "양준서",
    "배소율", "백현우", "남주하", "심규진", "노아인", "하태양", "구슬비", "변지훈", "설아라", "추민성",
  ];
  const SCHOOLS: Record<string, string[]> = {
    고: ["한빛고", "송파고", "위례고", "광진고"],
    중: ["가람중", "미림중", "위례중", "자양중"],
    초: ["가람초", "한솔초", "위례초", "광남초"],
  };
  return NAMES.map((name, i) => {
    const cls = classes[i % classes.length];
    const grade = gradeOf(cls.name);
    const pool = SCHOOLS[grade[0]] ?? SCHOOLS["중"];
    return {
      id: STUDENT(i + 1),
      no: String(240101 + i * 7),
      name,
      school: pool[i % pool.length],
      grade,
      classId: cls.id,
      className: cls.name,
      teacherName: cls.teacherName,
      campus: cls.campus,
      unit: cls.unit,
      motherPhone: `010-${3200 + i * 13}-${6100 + i * 11}`,
      fatherPhone: `010-${5100 + i * 17}-${2200 + i * 9}`,
    };
  });
}

function seedSessions(): Session[] {
  return [
    {
      id: SESSION(),
      title: "2026 대학교 입시 설명회",
      campus: "전체",
      date: new Date("2026-08-21T00:00:00+09:00"),
      round: 1,
      time: "11:00",
      place: "서울시 교통회관 (올림픽로 319)",
      desc: "수시·정시 전략과 학부모 대입 로드맵.",
      attendField: true,
      active: true,
      ended: false,
      banner: "violet",
      notice: "",
      surveySms: "[늘푸른수학원] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기 남기기: {설문링크}",
    },
  ];
}

/** 예약 17건 — reservedBy(모/부/양쪽)·source·행위자 기준 logs·scannerNo (와이어프레임 시드) */
function seedReservations(students: Student[]): Reservation[] {
  let seq = 0;
  const mk = (
    stIdx: number,
    opt: {
      by: ReservedBy;
      source: ReservationSource;
      status?: ReservationStatus;
      scannerNo?: number;
      enteredAt?: Date;
      reservedAt: Date;
      cancelledAt?: Date;
    },
  ): Reservation => {
    const st = students[stIdx];
    const manual = opt.source !== "웹앱";
    const createdLabel = manual ? "수동 예약" : "웹앱 예약";
    const logs = [{ label: createdLabel, at: opt.reservedAt }];
    if (opt.status === "cancelled" && opt.cancelledAt) {
      logs.push({ label: manual ? "수동 예약 취소" : "웹앱 예약 취소", at: opt.cancelledAt });
    }
    seq += 1;
    return {
      id: RESERVATION(seq),
      code: `NPR-SS1-${String(seq).padStart(4, "0")}`,
      qrToken: QR_TOKEN(seq),
      sessionId: SESSION(),
      studentId: st.id,
      name: st.name,
      school: st.school,
      grade: st.grade,
      className: st.className,
      teacherName: st.teacherName,
      campus: st.campus,
      unit: st.unit,
      phone: st.motherPhone,
      channel: manual ? "manual" : "mobile",
      status: opt.status ?? "reserved",
      reservedBy: opt.by,
      source: opt.source,
      attendCount: 1,
      member: true,
      reservedAt: opt.reservedAt,
      scannerNo: opt.scannerNo ?? null,
      enteredAt: opt.enteredAt ?? null,
      logs,
      history: [],
      codeHistory: [],
      audit: [],
      groupId: null,
      cancelledBy: opt.status === "cancelled" ? (manual ? "staff" : "parent") : null,
    };
  };

  const rows = [
    mk(0, { by: "모", source: "웹앱", reservedAt: at("07-12", "10:23:41") }),
    mk(1, { by: "부", source: "웹앱", status: "entered", scannerNo: 1, enteredAt: at("07-16", "13:58:41"), reservedAt: at("07-11", "21:05:17") }),
    mk(2, { by: "모/부", source: "웹앱", reservedAt: at("07-13", "09:41:02") }),
    mk(3, { by: "모", source: "수동", reservedAt: at("07-13", "14:12:55") }),
    mk(4, { by: "모", source: "웹앱", status: "cancelled", reservedAt: at("07-10", "18:30:12"), cancelledAt: at("07-14", "08:02:33") }),
    mk(5, { by: "부", source: "웹앱", status: "entered", scannerNo: 2, enteredAt: at("07-16", "14:02:09"), reservedAt: at("07-12", "11:47:28") }),
    mk(6, { by: "모", source: "수동", status: "cancelled", reservedAt: at("07-12", "15:20:44"), cancelledAt: at("07-15", "10:11:05") }),
    mk(7, { by: "모", source: "웹앱", reservedAt: at("07-14", "20:18:36") }),
    mk(8, { by: "모/부", source: "웹앱", status: "entered", scannerNo: 1, enteredAt: at("07-16", "14:05:57"), reservedAt: at("07-13", "19:22:10") }),
    mk(9, { by: "모", source: "웹앱", reservedAt: at("07-15", "08:55:19") }),
    mk(10, { by: "부", source: "수동", reservedAt: at("07-15", "13:40:27") }),
    mk(12, { by: "모", source: "웹앱", status: "entered", scannerNo: 3, enteredAt: at("07-16", "14:11:33"), reservedAt: at("07-14", "12:09:48") }),
    mk(14, { by: "모", source: "웹앱", reservedAt: at("07-14", "16:33:21") }),
    mk(15, { by: "모", source: "수동", reservedAt: at("07-15", "09:27:14") }),
    mk(20, { by: "부", source: "웹앱", reservedAt: at("07-15", "17:44:52") }),
  ];

  // 비재원생 2명 — 수동 추가 경로(전화예약·선생님 예약) (명세 §4.8)
  rows.push(
    {
      id: RESERVATION(16),
      code: "NPR-SS1-0016",
      qrToken: QR_TOKEN(16),
      sessionId: SESSION(),
      studentId: null,
      name: "유가온",
      school: "잠실중",
      grade: "중3",
      className: "비재원생",
      teacherName: "",
      campus: "송파캠퍼스",
      unit: "",
      phone: "010-7781-4420",
      channel: "manual",
      status: "reserved",
      reservedBy: "",
      source: "전화예약",
      attendCount: 1,
      member: false,
      reservedAt: at("07-14", "11:02:18"),
      scannerNo: null,
      enteredAt: null,
      logs: [{ label: "수동 예약", at: at("07-14", "11:02:18") }],
      history: [],
      codeHistory: [],
      audit: [],
      groupId: null,
      cancelledBy: null,
    },
    {
      id: RESERVATION(17),
      code: "NPR-SS1-0017",
      qrToken: QR_TOKEN(17),
      sessionId: SESSION(),
      studentId: null,
      name: "민서준",
      school: "광남고",
      grade: "고1",
      className: "비재원생",
      teacherName: "",
      campus: "광진캠퍼스",
      unit: "",
      phone: "010-6642-1193",
      channel: "manual",
      status: "entered",
      reservedBy: "",
      source: "선생님 예약",
      attendCount: 2,
      member: false,
      reservedAt: at("07-13", "17:26:40"),
      scannerNo: 2,
      enteredAt: at("07-16", "13:49:20"),
      logs: [{ label: "수동 예약", at: at("07-13", "17:26:40") }],
      history: [],
      codeHistory: [],
      audit: [],
      groupId: null,
      cancelledBy: null,
    },
  );
  return rows;
}

function seedDevices(): Device[] {
  return [
    { id: DEVICE(1), label: "스캐너 #1 · 송파 입구", model: 'iPad Pro 11" (4th)', scannerNo: 1, on: true, battery: 82, last: at("07-16", "14:20:00") },
    { id: DEVICE(2), label: "스캐너 #2 · 위례 입구", model: "iPad Air 5", scannerNo: 2, on: true, battery: 64, last: at("07-16", "14:19:00") },
    { id: DEVICE(3), label: "스캐너 #3 · 광진 입구", model: "Galaxy Tab S9", scannerNo: 3, on: true, battery: 51, last: at("07-16", "14:20:00") },
    { id: DEVICE(4), label: "예비", model: "iPad 9", scannerNo: 4, on: false, battery: 100, last: at("07-15", "18:00:00") },
  ];
}

/** 만족도 설문 6건 — 캠퍼스·단위·반·담임·별점·후기 (명세 §6.5) */
function seedSurveys(): SurveyResponse[] {
  const rows: Array<Omit<SurveyResponse, "id" | "sessionId" | "createdAt">> = [
    { campus: "송파캠퍼스", unit: "고등", student: "이서연", className: "고1A", teacherName: "김민서", phone: "010-3213-6111", rating: 5, comment: "입시 전략이 구체적이라 좋았어요. 특히 수시 최저지원 라인 설명과 학과별 합격 데이터가 인상적이었고, 상담 연계까지 바로 안내받을 수 있어 만족스러웠습니다." },
    { campus: "위례캠퍼스", unit: "고등", student: "강민준", className: "고1B", teacherName: "오세라", phone: "010-3265-6155", rating: 4, comment: "주차 안내가 조금 아쉬웠습니다." },
    { campus: "송파캠퍼스", unit: "중등1", student: "박도윤", className: "1A", teacherName: "박준영", phone: "010-3226-6122", rating: 5, comment: "" },
    { campus: "광진캠퍼스", unit: "초등", student: "전유나", className: "6C", teacherName: "박준영", phone: "010-3408-6276", rating: 4, comment: "자료를 미리 받고 싶어요." },
    { campus: "송파캠퍼스", unit: "과학", student: "조은우", className: "과고1A", teacherName: "한지원", phone: "010-3278-6166", rating: 3, comment: "" },
    { campus: "위례캠퍼스", unit: "특목", student: "서다인", className: "중2S", teacherName: "남기태", phone: "010-3343-6221", rating: 5, comment: "상담 연계가 특히 유용했어요." },
  ];
  return rows.map((r, i) => ({
    ...r,
    id: SURVEY(i + 1),
    sessionId: SESSION(),
    createdAt: at("07-16", `15:0${i}:00`),
  }));
}

export function seedDataset(): SeedDataset {
  const teachers = seedTeachers();
  const classes = seedClasses(teachers);
  const students = seedStudents(classes);
  const sessions = seedSessions();
  const reservations = seedReservations(students);

  return {
    teachers,
    classes,
    students,
    admin: { role: "admin", name: "관리자" },
    sessions,
    reservations,
    smsTemplates: [
      { id: TEMPLATE(1), name: "예약 확정 + QR", body: "[늘푸른수학원] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n입장 QR: {QR링크}" },
      { id: TEMPLATE(2), name: "전일 리마인드", body: "[늘푸른수학원] 내일 {일시} {설명회명}이 진행됩니다. 입장 QR을 준비해 주세요. {QR링크}" },
      { id: TEMPLATE(3), name: "만족도 설문 요청", body: "[늘푸른수학원] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기 남기기: {설문링크}" },
      { id: TEMPLATE(4), name: "취소 안내", body: "[늘푸른수학원] {설명회명} 예약이 취소되었습니다. 문의: {문의전화}" },
    ],
    smsLogs: [
      { id: uid("99999999", 1), when: at("07-15", "18:00:00"), to: 11, template: "전일 리마인드", session: "2026 대학교 입시 설명회", campus: "송파캠퍼스", ok: 11, fail: 0, auto: true },
      { id: uid("99999999", 2), when: at("07-12", "10:24:00"), to: 1, template: "예약 확정 + QR", session: "2026 대학교 입시 설명회", campus: "송파캠퍼스", ok: 1, fail: 0, auto: false },
    ],
    surveys: seedSurveys(),
    devices: seedDevices(),
    codeSeq: [[SESSION(), 17]],
  };
}
