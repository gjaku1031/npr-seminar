// entities/student 공개 API (barrel). (설계 §4.1)
export { isConverted, matchesPhoneSuffix } from "./model/student";
export type {
  Student,
  StudentDraft,
  StudentDivision,
  StudentReservationFilter,
  ConvertedFrom,
} from "./model/student";
