// entities/session 공개 API (barrel). 밖에서는 @/entities/session 로만 import한다. (설계 §4.1)
export {
  bannerThemeLabel,
  reservationRate,
  remainingSeats,
  isFull,
  isNearlyFull,
} from "./model/session";
export type {
  Session,
  SessionDraft,
  SessionStats,
  Reminder,
  BannerTheme,
} from "./model/session";
