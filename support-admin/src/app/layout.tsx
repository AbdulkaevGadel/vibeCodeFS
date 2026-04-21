import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupportBot - Сообщения",
  description: "Админ-панель сообщений SupportBot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
