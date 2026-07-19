import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// 리스킨 토큰 불변식 — globals.css 가 레거시 변수명을 유지하되 값은 늘푸른 팔레트여야 한다.
// (테스트 러너는 apps/web 에서 실행되므로 cwd 기준 경로.)
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").toLowerCase();

function tokenValue(name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  assert.ok(m, `token --${name} not found`);
  return m![1].trim();
}

test("legacy violet ramp maps to forest green", () => {
  assert.equal(tokenValue("violet-950"), "#183307");
  assert.equal(tokenValue("violet-800"), "#365f08"); // interactive primary
  assert.equal(tokenValue("violet-900"), "#264f09");
  assert.equal(tokenValue("violet-50"), "#f4f9e8");
  assert.equal(tokenValue("violet-100"), "#eaf3d0"); // selection bg source
});

test("legacy mint ramp maps to teal/blue accent", () => {
  assert.equal(tokenValue("mint-700"), "#006c8b"); // focus/info blue
  assert.equal(tokenValue("mint-500"), "#008aaa");
  assert.equal(tokenValue("mint-400"), "#00abdb"); // scanner accent blue
});

test("status stays distinct: success=teal, info=blue, danger=red, warning=orange", () => {
  assert.equal(tokenValue("status-success"), "#006c54");
  assert.equal(tokenValue("status-success-on-dark"), "#54d6b1");
  assert.equal(tokenValue("status-info"), "#006c8b");
  assert.equal(tokenValue("status-info-on-dark"), "#bbe2e9");
  assert.equal(tokenValue("status-danger"), "#b42318");
  assert.equal(tokenValue("status-danger-hover"), "#9a1d12");
  assert.equal(tokenValue("status-danger-on-dark"), "#fca5a5");
  assert.equal(tokenValue("status-warning"), "#a94d0a");
  assert.equal(tokenValue("status-warning-on-dark"), "#f9c059");
});

test("interactive + focus are the reskin values (focus is blue double ring)", () => {
  assert.equal(tokenValue("interactive-primary-hover"), "#264f09");
  assert.equal(tokenValue("interactive-primary-active"), "#183307");
  assert.equal(tokenValue("surface-brand"), "#183307");
  const focus = tokenValue("focus-ring");
  assert.ok(focus.includes("#006c8b"), "focus ring must use blue #006c8b");
  assert.ok(focus.includes("#ffffff"), "focus ring must be a double ring (white inner)");
});

test("no legacy blue/sky literals remain in production tokens", () => {
  const forbidden = [
    "#1d4ed8", "#2563eb", "#3b82f6", "#1b3fa8", "#0f1b33", "#60a5fa",
    "#0ea5e9", "#38bdf8", "#0284c7", "#0369a1", "#eff5ff", "#f0f9ff",
    "rgba(37, 99, 235", "rgba(14, 165, 233", "rgba(56, 189, 248",
  ];
  for (const lit of forbidden) {
    assert.ok(!css.includes(lit), `legacy blue literal must be gone: ${lit}`);
  }
});
