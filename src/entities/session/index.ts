// entities/session 공개 API (barrel). 밖에서는 @/entities/session 로만 import한다. (설계 §4.1)
export {
  bannerThemeLabel,
  DEFAULT_SURVEY_SMS,
  reservationRate,
  remainingSeats,
  isFull,
  isVisibleAtCampus,
} from "./model/session";
export type { Session, SessionDraft, SessionStats, BannerTheme } from "./model/session";
