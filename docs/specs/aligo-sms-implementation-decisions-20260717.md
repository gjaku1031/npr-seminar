# Aligo SMS implementation decisions (2026-07-17)

## Sources and scope

- Product/provider handoff: [Notion - 문자 발송 api](https://app.notion.com/p/3a0b98a395a480638b82d511c4557674)
- Provider contract: [Aligo 문자 API SPEC](https://smartsms.aligo.in/admin/api/spec.html)
- Product behavior: `docs/specs/npr-seminar-feature-spec.md` section 5 and
  `docs/specs/nestjs-backend-handoff.md` sections 8.7 and 9.

The previous decision to defer SMS is superseded. The production NestJS backend
must support these message sources through one provider port and one durable
outbox:

1. booking OTP,
2. family-booking confirmation with the family QR link,
3. booking cancellation,
4. the first successful check-in only,
5. admin group send,
6. post-session survey send.

No provider request is made inside a domain transaction. The transaction writes
the domain event and the corresponding outbox row atomically.

## Secrets

The source Notion page currently contains plaintext credentials. None of those
values may be copied to Git, examples, fixtures, logs, screenshots, build output,
or API responses. Production credentials must be rotated before go-live and
stored only in the release host's root-readable runtime environment.

Required runtime keys, with values intentionally omitted:

```dotenv
ALIGO_IDENTIFIER=
ALIGO_KEY=
SMS_ENABLED=false
SMS_RECIPIENT_ALLOWLIST_ENABLED=true
SMS_TEST_RECIPIENTS=
SMS_SENDER_CAMPUS_A=
SMS_SENDER_CAMPUS_B=
SMS_SENDER_CAMPUS_C=
SMS_ALIGO_TEST_MODE=true
```

`SMS_ENABLED` defaults to false. Missing provider credentials or a missing
branch sender is a fail-closed configuration error, never a silent success.
Non-production environments force Aligo `testmode_yn=Y` even if an environment
variable attempts to disable it.

## Provider request

- Endpoint: `POST https://apis.aligo.in/send/`
- Content type: `application/x-www-form-urlencoded`
- Required fields: `key`, `user_id`, `sender`, `receiver`, `msg`
- Explicitly send `msg_type` as `SMS` or `LMS`; send `title` for LMS only.
- Send one provider request per outbox recipient. This preserves recipient-level
  idempotency, status, and audit semantics even when template variables differ.
- A positive `result_code` means the provider accepted the request. Store the
  provider `msg_id`, returned type, success/error counts, and a sanitized result
  code. A negative/zero result is a provider rejection.
- Use a bounded connect/response timeout. Authentication, sender, recipient, and
  payload errors are permanent. A network failure before a request is written is
  retryable. A timeout/reset after the request may have been accepted is
  `DELIVERY_UNKNOWN` and must not be retried blindly because Aligo has no client
  idempotency token.

## Message encoding and validation

Aligo documents the carrier payload as EUC-KR and the SMS boundary as 90 bytes.
The server, not the browser, is authoritative:

- encode with an EUC-KR-compatible encoder and reject or visibly flag characters
  that cannot be represented; do not silently turn emoji/symbols into `?`;
- `1..90` encoded bytes is SMS;
- `91..2000` encoded bytes is LMS;
- LMS title is optional but, if present, must be `1..44` encoded bytes;
- normalize Korean phone numbers to digits and validate before encryption or
  provider submission;
- never log the full recipient, OTP, QR token, provider key, or plaintext message
  when it contains a bearer URL.

The frontend byte counter is advisory and must use the same shared rule or show
the server's computed type before final confirmation.

## Sender and recipient policy

- Sender selection is server-owned and derived from the booking/student branch.
- Branch order in the legacy handoff is CAMPUS_A, CAMPUS_B, CAMPUS_C, but production
  uses explicit per-branch variables rather than a positional list.
- Admin group send never has an `ALL` sender. The operator selects exactly one
  branch, matching the existing product specification.
- When `SMS_RECIPIENT_ALLOWLIST_ENABLED=true`, a non-allowlisted recipient is
  recorded as `BLOCKED_ALLOWLIST` and no Aligo request occurs.
- Logs and admin APIs expose only masked recipients.

## Outbox and idempotency

Each logical recipient/message pair has a deterministic event key with a unique
constraint. Replaying an API `Idempotency-Key` cannot enqueue another message.
Workers claim rows with a short lease using `FOR UPDATE SKIP LOCKED`, perform the
external call after commit, and then persist the sanitized result.

Suggested terminal states:

- `SENT`
- `BLOCKED_ALLOWLIST`
- `FAILED_PERMANENT`
- `DELIVERY_UNKNOWN`
- `DEAD`

Retryable states use bounded exponential backoff with jitter and a maximum
attempt count. `DELIVERY_UNKNOWN` requires operator reconciliation and is never
automatically re-sent.

## OTP-specific rules

- OTP codes are cryptographically random, short-lived, purpose-bound, and stored
  only as a keyed digest.
- Rate-limit by normalized contact digest, IP digest, and global window.
- Verification is single-use with a bounded attempt count.
- API responses do not reveal whether a contact exists and never return the OTP
  outside a test-only injected gateway fixture.

## Verification gates

1. Unit tests with a fake Aligo HTTP server cover success, provider rejection,
   timeout-before-write, uncertain timeout, allowlist blocking, sender mapping,
   EUC-KR limits, and secret/PII redaction.
2. PostgreSQL integration tests prove atomic event/outbox insert, unique event
   keys, concurrent worker claiming, and exactly one check-in message.
3. API E2E covers OTP, booking confirmation, cancellation, first check-in,
   admin preview/send/history, and survey send without a live provider.
4. Aligo `testmode_yn=Y` credential verification is optional and must happen only
   after rotated credentials are installed on `pve-release`.
5. A real message is sent only to a phone number explicitly confirmed by the
   user at the final production verification gate.
