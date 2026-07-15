// features/create-seminar 공개 API (barrel). (설계 §4.1)
// Server Action은 슬라이스 내부(폼)에서만 쓰므로 노출하지 않는다 — 공개 API는 최소로.
export { CreateSeminarForm } from "./ui/CreateSeminarForm";
