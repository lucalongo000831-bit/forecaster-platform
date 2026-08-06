import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kairo — Market Intelligence",
  description: "A responsive market analysis terminal with server-side financial data and explicit demo fallbacks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
