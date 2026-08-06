import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kairo — Market Intelligence",
  description: "A responsive static market analysis terminal powered by realistic mock data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
