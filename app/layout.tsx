import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEM FC · Cùng ra sân, cùng hết mình",
  description:
    "Ngôi nhà chung của MEM FC. Lên lịch đá bóng, bình chọn tham gia, chia đội cân bằng và quản lý quỹ minh bạch.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#163e33",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
