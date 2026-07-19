# qr-poc port matrix — 2026-07-17

## Pinned source

- Repository: <https://github.com/hge2ne/qr-poc>
- Branch: `main`
- Commit: `c4194a00d3f5d87177cd131db854ae7b3ccff0f3`
- Merge subject: `merge: fix/scanner-final 병합 - 스캐너 카메라 수정 채택`

The remote heads were fetched again on 2026-07-17. `main` still resolves to
the commit above; `fix/scanner-final` resolves to
`7fea9461c5f6f5f7dc2a648d4b8455e98f76ce58` and is already merged into the
pinned `main` commit.

## Port faithfully

- QR rendering uses pure black on white, error correction `M`, a four-module
  quiet zone, and a minimum rendered size of 224 pixels.
- QR payloads use the compact same-origin `/q/{token}` path.
- Camera direction and `1440×1080` 4:3 resolution are requested when scanning
  starts. Resolution is not renegotiated after startup.
- The injected video keeps its native aspect ratio. Do not force it into a
  square with width/height plus `object-fit: cover`; that distorts the decoder
  canvas on iOS WebKit's ZXing fallback.
- `disableFlip: true` prevents redundant decoding of mirrored frames. Front
  camera mirroring is visual CSS only.
- iPadOS desktop user agents are distinguished from Macs using
  `navigator.maxTouchPoints > 1`. The fixed iPad installation prefers the
  front camera; phones and Android tablets prefer the rear camera.
- Preserve camera retry/cleanup, torch support, the diagnostic mode, session
  selection, the 2.5-second duplicate-token cooldown, and distinct success,
  duplicate, wrong-session, cancelled, invalid, and network states.
- Preserve the contact-last-four manual lookup interaction, but only for
  existing reservations.

## Adapt to the NPR domain

- One active QR belongs to one `family_booking`, not to each student or parent.
- Raw QR material exists only in the first issue/rotation response. PostgreSQL,
  Redis persistence, logs, tracing, analytics, and error metadata contain only
  digests or safe identifiers.
- Browser calls use the same-origin `/api/v1` OpenAPI contract and the paired
  scanner's HttpOnly session. Next.js does not modify the database directly.
- The selected scanner session is server-validated. An `ALL` session is valid
  for every branch device; a `BRANCH` session is valid only for the device's
  branch.
- Public and scanner responses expose masked/minimal family details and never
  return full phone numbers.

## Do not port

- Per-attendee QR ownership or stable raw QR columns
- Plaintext passwords, weak cookies, or POC role selection
- Prisma access from Next.js Server Actions
- Automatic booking/check-in for an unreserved student
- QR tokens or full phone numbers in entry logs
- SMS delivery, SMS campaigns, or SMS OTP delivery in this phase
- POC concurrency behavior that relies on a read followed by an unlocked
  update

## Current NPR frontend drift to fix after design approval

The existing NPR scanner was ported before the final iOS fixes. It currently
forces the injected video into a square with `object-fit: cover`, renegotiates
to 1920×1080 after startup, and conditionally enables flip decoding. Its QR
component also defaults to a 120-pixel surface with no library quiet-zone
margin. Claude Opus must replace those details with the pinned behavior while
implementing the user-approved scanner design; product frontend code remains
unchanged until that approval.
