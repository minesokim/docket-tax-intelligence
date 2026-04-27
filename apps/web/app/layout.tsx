import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Docket Tax Intelligence",
  description: "AI-native tax intelligence with source-backed facts and human review gates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
