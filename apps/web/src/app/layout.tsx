import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oura Health Dashboard",
  description: "Personal health tracker connected to Oura"
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
