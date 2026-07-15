import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NPR Seminar",
  description: "NPR 세미나 운영",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
