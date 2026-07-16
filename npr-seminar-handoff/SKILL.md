---
name: ipsi-seolmyeonghoe-design
description: Use this skill to generate well-branded interfaces and assets for 입시설명회 (입시설명회 예약 시스템 — entrance-exam info-session reservation service for elementary/middle/high students, operated by academy npr), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key facts:
- Cool-gray surface (`--gray-1 #F7F8FA`) + navy ink (`--surface-brand #101828`) + pro blue (`--interactive-primary #1D4ED8`) + sky accent (`--mint-500 #0EA5E9`), light mode only. Cold, professional SaaS tone.
- Display font NanumSquareRound (300/400/700/800), body font Pretendard Variable — both in `assets/fonts/` with @font-face in `tokens/fonts.css`.
- Motion is a first-class citizen: use tokens in `tokens/motion.css` (`--ease-spring`, `ds-fade-up`, `ds-stamp`, 70ms stagger). Respect `prefers-reduced-motion`.
- Copy tone: 해요체, short sentences, no emoji. Status vocabulary: 예약 확정 / 마감 임박 / 마감 / 대기 n번 / 취소됨.
- Components live in `components/` (React, namespace `DesignSystem_179b2a`); click-through apps in `ui_kits/reservation/` and `ui_kits/npr-admin/` (academy back-office + parent mobile).
- No logo exists — always use the plain-type wordmark, never draw a mark.
