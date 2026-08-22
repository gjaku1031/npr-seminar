import { AdminSessionGate } from "@/widgets/app-shell";

/** 정적 콘솔 셸. 브라우저가 현재 ADMIN 세션을 확인한 후에만 자식 화면을 마운트한다. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AdminSessionGate>{children}</AdminSessionGate>;
}
