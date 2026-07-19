# Design QA — 관리자 예약 명단

- Target route: `/students`
- Reference implementation: `docs/design/npr-seminar-handoff/ui_kits/npr-admin/StudentsScreen.jsx`
- User references: annotated NPR reservation-list screenshots in the active Codex task, including the 1237×1195 roster state and the unit-filter chip reference.
- Required state: selected seminar session, branch filter `전체`, full admin contacts, mixed unbooked/reserved/cancelled/checked-in rows, and latest-log modal.
- Browser constraint: use only the user's in-app browser; Playwright or another browser has not been authorized.

## Comparison status

The implementation is grounded in the existing screen, design tokens, and shared components. A same-viewport rendered screenshot cannot be captured by the agent from the user's chosen browser. The required side-by-side visual comparison therefore remains pending until the production route is deployed and the user opens `/students` in the in-app browser.

## Final result

`blocked` — awaiting the user's rendered production screenshot/annotation and explicit visual approval. Functional and code-quality gates are tracked separately and do not count as visual approval.
