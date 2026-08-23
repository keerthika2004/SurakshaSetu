import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SurakshaSetu | Cyber Fraud Emergency Room",
  description: "A calmer first step when something online feels suspicious.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
