// entities/user 공개 API (barrel). (설계 §4.1)
export {
  ALL_MODULES,
  canAccessModule,
  moduleLabel,
} from "./model/user";
export type { User, UserRole, ModuleKey } from "./model/user";
