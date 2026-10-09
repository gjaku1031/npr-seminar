import { LoginSessionGate } from "@/features/auth";

/**
 * 공개 로그인 화면. 브라우저의 `/auth/me` 결과에 따라 관리자만 콘솔로 이동함
 */
export default function LoginPage() {
  return <LoginSessionGate />;
}
