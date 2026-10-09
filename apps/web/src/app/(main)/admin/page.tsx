"use client";

import { useEffect } from "react";

/**
 * 기존 `/admin` 북마크를 인증 게이트 통과 뒤 실제 콘솔 홈으로 이동시킴
 */
export default function AdminHubPage() {
  useEffect(() => {
    window.location.replace("/sessions/");
  }, []);

  return <p role="status">운영 콘솔로 이동 중입니다…</p>;
}
