/* CloudFront Functions JavaScript runtime 2.0, viewer-request. ESM/CommonJS 문법을 쓰지 않는다. */

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
var BOOKING_PATH = /^\/booking\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\/?$/;
var SAFE_ASSET_PATH = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.!-]*\.[A-Za-z0-9]+$/;

/**
 * 알려진 정적 페이지와 UUID 예약 링크를 S3 객체 키로 바꾼다.
 * API 경로는 원본 요청 그대로 반환한다. URL의 query string은 request.uri와 분리되어
 * 있으며, 내부 URI 변경으로 브라우저 주소나 fragment가 바뀌지 않는다.
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

/** @returns {object} 출처나 파일 존재 여부를 드러내지 않는 404 응답 */
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
