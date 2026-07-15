// entities/seminar 공개 API (barrel). 밖에서는 @/entities/seminar 로만 import한다. (설계 §4.1)
export { SeminarCard } from "./ui/SeminarCard";
export { seminarStatusLabel } from "./model/seminar";
export type { Seminar, SeminarDraft, SeminarStatus } from "./model/seminar";
