# 정적 웹 배포 계약

2026-09-26 기준 구현 자료다. 이 디렉터리는 **정적 산출물의 로컬 미리보기와 CloudFront 경로 처리 코드**를 제공한다. AWS 리소스 생성, 기존 운영 인입점 교체, 실제 업로드는 포함하지 않는다.

실제로 수행한 검사와 남은 검증 범위는 [검증 기록](VERIFICATION.md)에 구분한다.

## 요청 경로

| 공개 주소 | CloudFront 원본 | 처리 |
| --- | --- | --- |
| `/api/v1` 및 `/api/v1/*` | 기존 Nest로 이어지는 별도 HTTPS API 원본 | 요청 경로·query·쿠키·본문을 유지하고 캐시 비활성화 |
| `/booking/{UUIDv4}` | 비공개 S3 | `booking/detail/index.html`로 **내부 URI만** 변경. 브라우저 주소, query, fragment 유지 |
| `/booking/access`, `/reserve`, 관리자 등 알려진 화면 | 비공개 S3 | 각 경로의 `index.html` 객체 키로 변경 |
| `/_next/static/*`, 이미지, `.txt` 등 정적 파일 | 비공개 S3 | 파일 키를 그대로 요청. 존재하지 않는 파일을 HTML로 대체하지 않음 |
| 알 수 없는 확장자 없는 경로·잘못된 예약 ID | 없음 | 404 |

[`cloudfront-viewer-request.js`](cloudfront-viewer-request.js)는 CloudFront Functions의 `cloudfront-js-2.0` **viewer-request** 소스다. 빌드·번들 없이 함수 코드로 등록한다. 정적 원본의 기본 동작과 API behavior에 동일 함수를 연결할 수 있다. CloudFront는 **함수 실행 전에** cache behavior와 원본을 결정하므로 함수의 `/api/v1` pass-through만으로 API 원본이 선택되지는 않는다. `/api/v1`과 `/api/v1/*`를 S3 기본 behavior보다 앞에 별도로 등록한다. `/booking/{UUID}`와 다른 정적 주소는 S3 behavior에서 처리한다. 디렉터리 index 변환은 CloudFront 기본 루트 객체 설정만으로는 하위 경로에 적용되지 않는다.

예약 ID는 Nest `ParseUUIDPipe`의 UUIDv4 형식만 허용한다. 이 단계에서 파일 존재나 예약 소유 여부를 CDN이 검사하지 않는다. 셸의 실제 예약 조회는 브라우저가 원래 `location.pathname`에서 ID를 읽고 연락처 확인 후 Nest에 요청한다. `/booking/access#token=...`은 다른 흐름이며 셸로 치환하지 않는다. 클라이언트가 `/booking/{UUIDv4}`로 Next 내부 RSC 탐색을 시도하면 그 주소에 대응하는 정적 `.txt`가 없으므로, 해당 링크는 전체 문서 탐색으로 열어야 한다.

## 로컬 미리보기

저장소 루트에서 정적 빌드를 끝낸 뒤 Node.js 22로 실행한다. `serve.mjs`는 **`apps/web/out`만** 제공하고 추가 패키지가 필요 없다.

```bash
PORT=3410 NEST_API_ORIGIN=http://127.0.0.1:4400 node ops/static-web/serve.mjs
```

`http://127.0.0.1:3410`만 수신하고 Host도 정확히 `127.0.0.1:3410`으로 제한한다. `PORT`는 생략하면 3410이다. `NEST_API_ORIGIN`은 선택 사항이다. 미설정 시 `/api/v1/*`는 `503 application/problem+json`을 반환하며, 화면만 로컬에서 살펴볼 수 있다. API 원본은 인증 정보·경로·쿼리 없는 HTTP(S) origin이어야 한다. 서버는 S3/CloudFront 운영 런타임이 아니다.

프록시는 API 요청·응답을 스트림으로 전달하고 `Cookie`, `Set-Cookie`, `Origin`, `X-CSRF-Token`, `Idempotency-Key`, query를 유지한다. 클라이언트의 `Forwarded`/`X-Forwarded-*`/hop-by-hop 헤더는 버리고 `X-Forwarded-Host: 127.0.0.1:3410`, `X-Forwarded-Proto: http`를 만든다. 이 로컬 구성에서 Nest는 `PUBLIC_BASE_URL=http://127.0.0.1:3410`, `TRUST_PROXY=1`로 설정하고 loopback에서만 수신해야 한다. API 응답에는 `Cache-Control: no-store`를 강제한다. 정적 파일은 GET/HEAD만 허용하고 HTML·`.txt`는 재검증, `/_next/static`은 장기 캐시다. 잘못된 인코딩, 숨김 파일, 경로 이탈, 미존재 파일은 정적 HTML로 fallback하지 않는다.

## S3·CloudFront 구성안

1. **정적 원본:** S3 REST bucket origin과 Origin Access Control(OAC)을 사용한다. 버킷 공개 접근을 차단하고 CloudFront 배포 ARN만 `s3:GetObject`를 허용한다. S3 website endpoint는 OAC 원본으로 쓰지 않는다. CloudFront 기본 루트 객체는 `index.html`로 두되 하위 경로는 위 함수를 연결한다.
2. **API 원본:** 기존 Nest에 도달하는 별도 HTTPS 원본을 준비한다. 현재 운영 GCP Caddy는 Next로만 전달하고 Nest는 VM loopback에 묶여 있으므로, 배포 전에 Caddy/WireGuard의 보호 경로에서 `/api/v1/*`를 Nest로 전달할 인입점을 별도로 마련해야 한다. 기존 Next 서버를 중단하거나 기존 배포 스크립트를 정적 배포로 간주하지 않는다. API 원본에는 TLS 인증서의 호스트명 일치, 원본 접근 제한, 직접 우회 요청 차단이 필요하다.
3. **behavior 순서:** `/api/v1`과 `/api/v1/*` → API 원본, 나머지 → S3. API는 HTTPS only, 허용 메서드 GET·HEAD·OPTIONS·PUT·POST·PATCH·DELETE, managed `CachingDisabled`(최소·기본·최대 TTL 0)로 둔다. API의 401/403/404를 정적 `index.html`로 바꾸는 배포 전체 custom error page를 두지 않는다. 정적 behavior는 GET·HEAD, 원본 Cache-Control을 존중하는 최소 TTL 0 정책으로 둔다. 버전 해시가 붙은 `/_next/static/*`만 장기 캐시하고 HTML과 `.txt`는 재검증한다.
4. **API 전달 정책:** API behavior의 origin request policy에서 **모든 cookie와 query string**을 전달한다. 헤더는 현재 웹 클라이언트가 쓰는 `Accept`, `Content-Type`, `X-CSRF-Token`, `X-Booking-Proof`, `Idempotency-Key`, `If-Match`와 브라우저의 `Origin`, `Referer`를 명시적으로 허용한다. 계약의 `X-QR-Token`과 `Authorization`이 사용되는 경로도 전달할 수 있게 포함한다. 브라우저의 `Host`, `Forwarded`, `X-Forwarded-*`는 신뢰하지 않는다. CloudFront가 API 원본의 TLS 호스트명으로 Host를 보내고, 마지막으로 Nest에 접속하는 신뢰된 loopback 프록시가 검증된 공개 origin에서 정확한 `X-Forwarded-Host`와 `X-Forwarded-Proto`를 **덮어써야** 한다. `X-Forwarded-For`는 체인을 전달하지 말고 제거하거나 검증된 단일 IP로 재설정한다. Nest는 쉼표로 연결된 여러 IP를 거절한다. 기존 Nest의 `PUBLIC_BASE_URL`과 이 공개 origin을 일치시키고, `TRUST_PROXY=1`과 실제 loopback 피어 조건을 유지한다. 직접 API 호출이나 임의 Host·Origin으로 같은 출처 검사를 통과시키지 않는다.
5. **파일 업로드:** 검증된 `apps/web/out`만 업로드한다. 새 `_next/static` 자산을 먼저 올리고 HTML·`.txt`를 나중에 갱신한다. 이미 참조된 이전 해시 자산은 당장 지우지 않는다. HTML과 `.txt`는 `Cache-Control: no-cache`, 해시 자산은 `public, max-age=31536000, immutable` 메타데이터를 준다. `.txt`는 Next의 RSC 정적 파일이므로 `Content-Type: text/plain`을 확인한다. CloudFront 배포 변경 및 필요한 invalidation 후 원본 정적 파일과 API 흐름을 확인한다.

예시 업로드 명령은 bucket·배포·접근 통제가 준비된 환경에서만 실행한다. 변수 값은 운영 환경에서 정하고 저장소에 넣지 않는다.

```bash
aws s3 sync apps/web/out/_next/static/ "s3://$STATIC_BUCKET/_next/static/" \
  --no-follow-symlinks --cache-control 'public, max-age=31536000, immutable'
aws s3 sync apps/web/out/ "s3://$STATIC_BUCKET/" \
  --no-follow-symlinks --exclude '_next/static/*' --cache-control 'no-cache'
```

위 명령은 기존 객체를 삭제하지 않는다. 실제 전환·원복 절차는 현재 원본 연결과 쿠키·CSRF·관리자 접근·예약 문자 링크를 격리 환경에서 검증한 후 확정한다. 로그와 배포 기록에는 cookie, CSRF/proof, 전화번호, query의 민감 값을 남기지 않는다.

## 근거

- [CloudFront behavior는 URI rewrite 전에 선택](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html), [behavior 순서와 path 정규화](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html)
- [CloudFront Functions 이벤트와 응답 형식](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html), [JavaScript runtime 2.0](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-javascript-runtime-20.html)
- [Origin request policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html), [managed CachingDisabled](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html)
