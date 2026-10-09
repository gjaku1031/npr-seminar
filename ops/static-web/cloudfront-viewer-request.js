/*
 * 정적 웹 CloudFront viewer-request 함수. 페이지 경로·예약 링크를 S3 객체 키로 바꾸고 나머지 낯선 경로는 404
 * CloudFront Functions JavaScript runtime 2.0. ESM/CommonJS 문법을 쓰지 않음
 * 로컬 미리보기 서버(serve.mjs)도 이 파일을 그대로 실행함
 */

/**
 * index.html 로 바꿀 정적 페이지 경로
 */
var PAGE_PATHS = {
  "/": true,
  "/reserve": true,
  "/login": true,
  "/admin": true,
  "/sessions": true,
  "/students": true,
  "/sms": true,
  "/stats": true,
  "/student-status": true,
  "/counsel": true,
  "/scanner": true,
  "/scanner/connect": true,
  "/booking/access": true,
  "/booking/detail": true
};

/**
 * 문자 개인 링크 `/booking/<UUID v4>`. 예약 상세 페이지로 보냄
 */
var BOOKING_PATH = /^\/booking\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\/?$/;

/**
 * 점으로 시작하지 않는 안전한 정적 파일 경로
 */
var SAFE_ASSET_PATH = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.!-]*\.[A-Za-z0-9]+$/;

/**
 * 알려진 정적 페이지와 UUID 예약 링크를 S3 객체 키로 바꿈
 * API 경로는 원본 요청 그대로 반환함. URL의 query string은 request.uri와 분리되어
 * 있으며, 내부 URI 변경으로 브라우저 주소나 fragment가 바뀌지 않음
 *
 * @param {{request: {uri: string}}} event CloudFront viewer-request 이벤트
 * @returns {object} 수정한 요청 또는 정적 경로의 404 응답
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/api/v1" || uri.indexOf("/api/v1/") === 0) return request;
  if (typeof uri !== "string" || uri.charAt(0) !== "/" || uri.indexOf("%") !== -1 ||
      uri.indexOf("\\") !== -1 || uri.indexOf("//") !== -1 ||
      /[\u0000-\u001f\u007f]/.test(uri)) return notFound();

  if (BOOKING_PATH.test(uri)) {
    request.uri = "/booking/detail/index.html";
    return request;
  }

  var page = uri.length > 1 && uri.charAt(uri.length - 1) === "/" ? uri.slice(0, -1) : uri;
  if (PAGE_PATHS[page] === true) {
    request.uri = page === "/" ? "/index.html" : page + "/index.html";
    return request;
  }

  if (SAFE_ASSET_PATH.test(uri) && uri.split("/").every(function (part) {
    return part === "" || part.charAt(0) !== ".";
  })) return request;

  return notFound();
}

/**
 * 출처나 파일 존재 여부를 드러내지 않는 404 응답
 * @returns {object} 404 응답
 */
function notFound() {
  return {
    statusCode: 404,
    statusDescription: "Not Found",
    headers: {
      "cache-control": {value: "no-store"},
      "content-type": {value: "text/plain; charset=utf-8"},
      "x-content-type-options": {value: "nosniff"}
    },
    body: "Not Found"
  };
}
