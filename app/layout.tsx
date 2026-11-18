import type { Metadata } from "next";
import { Antonio, Manrope } from "next/font/google";
import "./globals.css";

// Fernhollow 디자인의 글꼴: 제목·숫자는 키가 큰 압축체 Antonio, 나머지는 Manrope.
// 두 글꼴 모두 영문·숫자용이라 한글은 globals.css의 한글 대체 글꼴(맑은 고딕 등)로 보인다.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const antonio = Antonio({
  variable: "--font-antonio",
  subsets: ["latin"],
  weight: "400",
});

// 브라우저 탭에 보이는 제목과 설명 (PLAN 작업 1번)
export const metadata: Metadata = {
  title: "핑계봇",
  description: "지각할 때, 상사에게 보낼 메시지를 1분 안에 만들어 드려요",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${manrope.variable} ${antonio.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
