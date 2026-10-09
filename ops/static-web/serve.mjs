#!/usr/bin/env node
/**
 * 로컬 전용 정적 export 미리보기와 같은 출처 Nest API 프록시. 운영 서버로 사용하지 않음
 *
 * 실행: apps/web 정적 빌드 후 `PORT=3410 NEST_API_ORIGIN=http://127.0.0.1:4400 node ops/static-web/serve.mjs`
 * 127.0.0.1 에서만 수신하고 Host 도 `127.0.0.1:<PORT>` 로 제한함. NEST_API_ORIGIN 이 없으면 `/api/v1/*` 는 503
 * 페이지 경로 해석은 CloudFront 함수(cloudfront-viewer-request.js)를 그대로 실행해 운영과 맞춤
 */
import {open, realpath} from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {pipeline} from "node:stream";
import {readFile} from "node:fs/promises";

/**
 * 수신 포트. 기본 3410
 */
const PORT = parsePort(process.env.PORT ?? "3410");

/**
 * 수신 주소. 루프백 고정
 */
const HOST = "127.0.0.1";

/**
 * 허용 Host 헤더 값
 */
const PUBLIC_HOST = `${HOST}:${PORT}`;

/**
 * 정적 export 산출물 디렉터리
 */
const outDirectory = fileURLToPath(new URL("../../apps/web/out/", import.meta.url));

/**
 * CloudFront viewer-request 함수 원문
 */
const functionSource = await readFile(new URL("./cloudfront-viewer-request.js", import.meta.url), "utf8");

/**
 * 함수를 격리 실행할 VM 컨텍스트
 */
const functionContext = vm.createContext({});
vm.runInContext(functionSource, functionContext, {filename: "cloudfront-viewer-request.js"});

/**
 * 경로를 S3 객체 키로 바꾸는 CloudFront 함수
 */
const routeRequest = functionContext.handler;

/**
 * 프록시 대상 Nest origin. 미설정이면 null
 */
const apiOrigin = parseApiOrigin(process.env.NEST_API_ORIGIN);

/**
 * 산출물 디렉터리 실제 경로. 없으면 시작하지 않음
 */
const outRoot = await realpath(outDirectory).catch(() => {
  throw new Error("apps/web/out 산출물이 없습니다. apps/web 정적 빌드를 먼저 실행하세요.");
});

/**
 * 확장자별 Content-Type
 */
const MIME = new Map([
  [".html", "text/html; charset=utf-8"], [".txt", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"], [".gif", "image/gif"], [".webp", "image/webp"],
  [".avif", "image/avif"], [".ico", "image/x-icon"], [".woff", "font/woff"],
  [".woff2", "font/woff2"], [".ttf", "font/ttf"], [".eot", "application/vnd.ms-fontobject"],
  [".xml", "application/xml; charset=utf-8"], [".webmanifest", "application/manifest+json"],
  [".map", "application/json; charset=utf-8"], [".pdf", "application/pdf"]
]);

/**
 * 프록시가 전달하지 않는 hop-by-hop·호스트 헤더
 */
const HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host", "forwarded"
]);

/**
 * PORT 값 검증
 * @param {string} value 포트 문자열 @returns {number} 사용할 TCP 포트
 */
function parsePort(value) {
  if (!/^[0-9]{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error("PORT는 1~65535 정수여야 합니다.");
  }
  return Number(value);
}

/**
 * NEST_API_ORIGIN 값 검증. 인증 정보·경로·query 없는 HTTP(S) origin 만 허용
 * @param {string | undefined} value 명시적인 Nest HTTP(S) 원본
 * @returns {URL | null} 루트 경로만 허용한 원본. 미설정이면 API 요청은 503임
 */
function parseApiOrigin(value) {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("NEST_API_ORIGIN URL이 잘못되었습니다."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("NEST_API_ORIGIN은 인증 정보·경로·쿼리 없는 HTTP(S) origin이어야 합니다.");
  }
  return parsed;
}

/**
 * application/problem+json 오류 응답. 헤더를 이미 보냈으면 연결을 끊음
 * @param {http.ServerResponse} response @param {number} status HTTP 상태 @param {string} title 안전한 오류 제목
 */
function problem(response, status, title) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  const body = JSON.stringify({type: "about:blank", title, status});
  response.writeHead(status, {
    "content-type": "application/problem+json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

/**
 * 연결별 요청을 API 스트림 또는 정적 export 파일로 전달함
 * Host를 고정해 임의 호스트가 Nest의 same-origin 판단에 들어가지 못하게 함
 * @param {http.IncomingMessage} request 브라우저 요청
 * @param {http.ServerResponse} response 브라우저 응답
 */
async function handle(request, response) {
  if (request.headers.host !== PUBLIC_HOST) { problem(response, 400, "Invalid Host"); return; }
  const target = request.url;
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") ||
      /[\u0000-\u001f\u007f\\#]/.test(target) || /%(?![0-9a-fA-F]{2})/.test(target)) {
    problem(response, 400, "Invalid URL"); return;
  }
  const uri = target.split("?", 1)[0];
  if (uri === "/api/v1" || uri.startsWith("/api/v1/")) {
    if (apiOrigin === null) { problem(response, 503, "API origin is not configured"); return; }
    proxyApi(request, response, target);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    problem(response, 405, "Method Not Allowed");
    return;
  }
  const rewritten = routeRequest({request: {uri}});
  if (rewritten.statusCode === 404) { problem(response, 404, "Not Found"); return; }
  await serveFile(rewritten.uri, request.method, response);
}

/**
 * API 요청·응답 본문을 버퍼링 없이 전달함. 쿠키·CSRF·Origin·query는 유지하고
 * 클라이언트가 지정한 프록시 메타데이터만 폐기함
 * @param {http.IncomingMessage} request 브라우저 요청
 * @param {http.ServerResponse} response 브라우저 응답
 * @param {string} target 원본 경로와 쿼리
 */
function proxyApi(request, response, target) {
  const connectionTokens = String(request.headers.connection ?? "").toLowerCase().split(",").map((s) => s.trim());
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !HOP_HEADERS.has(name) && !connectionTokens.includes(name) &&
        !name.startsWith("x-forwarded-") && !name.startsWith("proxy-")) headers[name] = value;
  }
  headers["x-forwarded-host"] = PUBLIC_HOST;
  headers["x-forwarded-proto"] = "http";
  const transport = apiOrigin.protocol === "https:" ? https : http;
  let upstream;
  try {
    upstream = transport.request(apiOrigin, {method: request.method, path: target, headers}, (originResponse) => {
      const omitted = new Set([...HOP_HEADERS, ...String(originResponse.headers.connection ?? "").toLowerCase().split(",").map((s) => s.trim())]);
      const responseHeaders = {};
      for (const [name, value] of Object.entries(originResponse.headers)) {
        if (value !== undefined && !omitted.has(name)) responseHeaders[name] = value;
      }
      responseHeaders["cache-control"] = "no-store";
      responseHeaders.pragma = "no-cache";
      responseHeaders.expires = "0";
      response.writeHead(originResponse.statusCode ?? 502, responseHeaders);
      pipeline(originResponse, response, (error) => {
        if (error && !response.destroyed) response.destroy(error);
      });
    });
  } catch {
    problem(response, 502, "API origin unavailable");
    return;
  }
  upstream.on("error", () => problem(response, 502, "API origin unavailable"));
  request.on("aborted", () => upstream.destroy());
  request.on("error", () => upstream.destroy());
  response.on("close", () => { if (!response.writableEnded) upstream.destroy(); });
  request.pipe(upstream);
}

/**
 * `out` 내부 일반 파일만 반환함. 심볼릭 링크의 실제 경로를 확인하며 HTML fallback은 없음
 * @param {string} uri CloudFront 함수와 같은 방식으로 선택한 객체 키
 * @param {string} method GET 또는 HEAD
 * @param {http.ServerResponse} response 브라우저 응답
 */
async function serveFile(uri, method, response) {
  let realFile;
  try {
    const candidate = path.resolve(outRoot, `.${uri}`);
    realFile = await realpath(candidate);
    if (!realFile.startsWith(`${outRoot}${path.sep}`)) { problem(response, 404, "Not Found"); return; }
  } catch { problem(response, 404, "Not Found"); return; }

  let handle;
  try {
    handle = await open(realFile, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) { await handle.close(); problem(response, 404, "Not Found"); return; }
    const extension = path.extname(realFile).toLowerCase();
    const cacheControl = extension === ".html" || extension === ".txt" ? "no-cache" :
      uri.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=300";
    response.writeHead(200, {
      "content-type": MIME.get(extension) ?? "application/octet-stream",
      "content-length": stat.size, "cache-control": cacheControl,
      "x-content-type-options": "nosniff"
    });
    if (method === "HEAD") { await handle.close(); response.end(); return; }
    pipeline(handle.createReadStream(), response, (error) => {
      if (error && !response.destroyed) response.destroy(error);
    });
  } catch {
    if (handle) await handle.close().catch(() => {});
    problem(response, 500, "Static file unavailable");
  }
}

/**
 * 미리보기 HTTP 서버. 처리 중 예외는 500 problem 응답
 */
const server = http.createServer((request, response) => {
  void handle(request, response).catch(() => problem(response, 500, "Preview server error"));
});
server.listen(PORT, HOST, () => {
  console.log(`정적 미리보기: http://${PUBLIC_HOST} (API ${apiOrigin === null ? "미설정" : "연결 설정"})`);
});
