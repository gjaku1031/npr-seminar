# NestJS implementation decisions — 2026-07-17 (historical addendum)

This addendum records implementation decisions made after
`nestjs-backend-handoff.md`. Where the two documents differ, this addendum is
the newer product decision.

This is a dated implementation record, not the current API contract. The
authoritative contract is `packages/contracts/openapi.yaml`; the current
product has unlimited sessions, uses `서울시 교통회관 (올림픽로 319)`, and
reports student rows, distinct active family bookings, and actual parent
attendees as separate absolute counts.

## Student class resolution

- The canonical student identity remains the globally unique source student
  number.
- Source class assignments are retained for traceability.
- A source assignment whose class name starts with `과`, or contains an
  explicit science subject token (`물리`, `화학`, `생명과학`/`생물`,
  `지구과학`), is a science assignment. Generic `이과` is not a token:
  `고3이과T` remains regular, while `과고3물리(금1)` and `화학 심화` are science.
- Science source assignments are preserved verbatim, but the representative
  class label exposed to the product is normalized to `과학`.
- A class name is eligible for ingestion when it is bracketless, or when its
  only bracket pair is one terminal timetable suffix. The suffix grammar is
  one to three distinct weekday characters followed by an optional positive
  slot from 1 to 99 without a leading zero (for example `[토3]`, `[월수]`,
  `[월토1]`) or `E`/`e` followed by that positive slot (for example `[E3]`).
  NFKC-normalized names containing `*`, repeated weekdays, zero/leading-zero
  slots, any other Latin prefix, leading/middle/multiple
  bracket pairs, management suffixes such as `[연장]`, and malformed pairs are
  rejected. Accepted suffixes and source keys remain verbatim on the source
  assignment; unit, science, supplementary, representative, and same-base
  de-duplication rules use the suffix-stripped base class.
- Assignments containing `특강`, `패키지`, `입시대비`, or `TEST`
  (case-insensitive) are supplementary/non-class assignments. They remain in
  source-assignment history but are excluded from representative-class
  candidates.
- The representative class chooses the sole remaining regular-class candidate.
  If there is no regular candidate but at least one science assignment, it is
  `과학`. Multiple regular candidates, or no regular/science candidate, remain
  ambiguous.
- `기하[시간]` remains a traceable source assignment but is a subject-only
  timetable assignment, so it is not a representative-class candidate.
- In the 2026-07-17 canonical snapshot, 371 students have multiple source
  assignments: 298 resolve to one regular class, 70 resolve to `과학`, one has
  multiple regular candidates, and two have no regular/science candidate.
- Across the complete 3,377-student snapshot, 2,986 resolve to one regular
  class, 387 resolve to `과학`, one has multiple regular candidates, and three
  have no regular/science candidate. Therefore four records require a
  data-quality flag overall. Three of those four are in the 371-student
  multiple-assignment subset; the remaining no-class record has only one
  supplementary assignment. The earlier substring-only rule incorrectly
  produced 28 ambiguous records.
- Ambiguous records must still be loaded without discarding their source
  assignments. They are exported to an access-controlled operational report;
  no student identifiers or contact information are committed to Git.

## Scanner device pairing

- An administrator creates a short-lived, single-use pairing code.
- The code expires after five minutes, is stored only as a digest in Redis,
  and is consumed atomically on the first successful claim.
- The iPad claims the code and receives a project-specific `SCANNER` session;
  staff do not type or share an administrator password on the scanner.
- Failed claims are rate-limited. The administrator can revoke a paired device
  and issue a new code.
- An administrator can atomically cancel an unclaimed pairing code before it
  expires. Cancellation uses the opaque pairing-code ID, never the displayed
  six-character code, and races safely with claim so exactly one outcome wins.
- Pairing can be removed either by an administrator or from the paired iPad.
  Both paths immediately revoke the scanner session, Redis presence, and shift
  lock while retaining the durable device history and every attendance/audit
  log. Re-pairing always requires a new short-lived code.
- A paired device sends authenticated heartbeat updates. PostgreSQL stores the
  durable device identity and audit history; Redis holds short-lived online
  presence.
- Heartbeats may report battery percentage and charging state when the browser
  exposes them. These fields are nullable; unsupported devices display an
  explicit unavailable state rather than an inferred value.
- Each durable scanner device is assigned to exactly one branch and one
  physical gate. Pairing does not bind the device permanently to a seminar
  session.
- At the beginning of an operating shift, the paired iPad explicitly selects
  an active seminar session. The scanner then locks that selection while it is
  accepting scans so a QR cannot be checked into the wrong session by an
  accidental navigation change.

## TongTongTong ingestion

- The three branches share one authenticated TongTongTong account and are
  collected by switching the active branch in the upstream UI.
- The source payload's `colModel` titles are the schema. The adapter maps each
  semantic field from `title` to `dataIndx` independently for every branch and
  sync run; fixed `m1`, `m2`, and similar positional assumptions are forbidden.
- A missing, duplicate, or incompatible required column fails that branch run
  closed before publishing any staged rows.
- Only currently enrolled students are included. Class-name admission follows
  the exact terminal timetable-suffix policy above; assignment-level and
  unique-student counts remain separate throughout staging, validation, and
  audit reporting.

## Public reservation ownership

- A verified contact proof authorizes only students whose stored parent-contact
  digest matches that proof.
- Student lookup for the public reservation flow is scoped to that authorized
  set. The booking transaction repeats the digest check for every selected
  student while holding the relevant family-booking and student-booking locks.
- A caller cannot reserve a student merely by knowing or guessing a student
  identifier.

## SMS deferral

- Real SMS delivery, campaign sending, and SMS OTP delivery are out of the
  current implementation scope.
- Production must fail closed when a flow requires an SMS-backed proof and no
  provider is configured.
- Automated reservation tests may use a test-environment-only verified-proof
  fixture. The fixture must be impossible to enable in production.
- Provider credentials and real delivery are added only when the operator can
  supply them in a later phase.

## Frontend approval gate

- Fable `/design` prepares the scanner pairing and iPad flow against the
  existing product design language.
- The design is served as a preview and explicitly approved by the user before
  product frontend code is changed.
- Claude Opus implements only the approved design. Design review and browser
  verification are repeated before handoff.
