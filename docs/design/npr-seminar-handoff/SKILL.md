---
name: ipsi-seolmyeonghoe-design
description: Use this skill to generate well-branded interfaces and assets for 입시설명회 (입시설명회 예약 시스템 — entrance-exam info-session reservation service for elementary/middle/high students, operated by academy npr), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key facts:
- 예시학원(Academy) brand. Warm neutral surface (`--gray-1 #F7F9F2`) + forest-green ink dark brand (`--surface-brand #183307`) + forest-green primary (`--interactive-primary #365F08`) + teal/blue accent (`--mint-500 #008AAA`), light mode only. Natural, friendly tone. Token names `violet-N`/`mint-N` are legacy — values map to forest/teal for compatibility (see `tokens/colors.css`).
- Display font NanumSquareRound (300/400/700/800), body font Pretendard Variable — both in `assets/fonts/` with @font-face in `tokens/fonts.css`.
- Motion is a first-class citizen: use tokens in `tokens/motion.css` (`--ease-spring`, `ds-fade-up`, `ds-stamp`, 70ms stagger). Respect `prefers-reduced-motion`.
- Copy tone: 해요체, short sentences, no emoji. Status vocabulary: 예약 확정 / 마감 임박 / 마감 / 대기 n번 / 취소됨.
- Components live in `components/` (React, namespace `DesignSystem_179b2a`); click-through apps in `ui_kits/reservation/` and `ui_kits/npr-admin/` (academy back-office + parent mobile).
- The real 예시학원 logo exists at `apps/web/public/brand/academy-logo-source.jpg` (green tree blob with white Korean lettering 예시). Always use the actual image via the `BrandMark` component (`shared/ui/BrandMark`) — never recreate it with text, SVG, or CSS art, and never key out the white (it forms the letters).
