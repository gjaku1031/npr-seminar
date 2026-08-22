"use client";

import { useSearchParams } from "next/navigation";
import { ReserveView } from "@/views/reserve";

/** 현재 URL의 `mode=manage`를 예약 관리 첫 화면으로 해석한다. 그 밖의 값은 일반 예약으로 연다. */
export function ReserveRoute() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "manage" ? "manage" : "reserve";
  return <ReserveView key={initialMode} initialMode={initialMode} />;
}
