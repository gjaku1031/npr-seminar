/**
 * Neon(Postgres) 시드 — v4.0 와이어프레임 데이터셋을 DB에 적재한다.
 *
 * 실행: pnpm db:seed   (사전에 pnpm db:migrate 필요)
 * - 데이터셋은 src/server/seed/data.ts — 인메모리 리포지토리와 동일해 화면 결과가 같다.
 * - 재실행 안전(idempotent): 전체 삭제 후 다시 넣는다. 운영 데이터가 생긴 뒤에는 실행하지 말 것.
 * - server-only 모듈을 통과하기 위해 react-server 조건으로 실행한다 (package.json db:seed).
 *
 * drizzle/neon import는 설계 규칙(R2)상 server/db·repositories/drizzle 구역 밖이지만,
 * 이 파일은 앱 코드가 아니라 운영 스크립트다 — drizzle.config.ts와 같은 지위.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/server/db/schema";
import { seedDataset } from "../src/server/seed/data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL이 없습니다. .env.local에 Neon 연결 문자열을 설정하세요. (README '개발')");
    process.exit(1);
  }

  const db = drizzle(neon(url), { schema });
  const data = seedDataset();

  console.log("기존 데이터 삭제 중 (FK 역순)...");
  await db.delete(schema.surveyResponses);
  await db.delete(schema.reservations);
  await db.delete(schema.students);
  await db.delete(schema.classes);
  await db.delete(schema.teachers);
  await db.delete(schema.smsLogs);
  await db.delete(schema.smsTemplates);
  await db.delete(schema.devices);
  await db.delete(schema.users);
  await db.delete(schema.sessions);

  console.log("시드 적재 중...");
  await db.insert(schema.teachers).values(data.teachers);
  await db.insert(schema.classes).values(data.classes);
  await db.insert(schema.students).values(data.students);
  await db.insert(schema.users).values([{ role: data.admin.role, name: data.admin.name }]);
  await db.insert(schema.sessions).values(data.sessions);
  await db.insert(schema.reservations).values(data.reservations);
  await db.insert(schema.smsTemplates).values(data.smsTemplates);
  await db.insert(schema.smsLogs).values(data.smsLogs);
  await db.insert(schema.surveyResponses).values(data.surveys);
  await db.insert(schema.devices).values(data.devices);

  console.log(
    [
      "시드 완료:",
      `  담임 ${data.teachers.length} · 반 ${data.classes.length} · 재원생 ${data.students.length}`,
      `  설명회 ${data.sessions.length} · 예약 ${data.reservations.length} (QR 토큰 포함)`,
      `  템플릿 ${data.smsTemplates.length} · 발송 로그 ${data.smsLogs.length} · 설문 ${data.surveys.length} · 스캐너 ${data.devices.length}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error("시드 실패:", error);
  process.exit(1);
});
