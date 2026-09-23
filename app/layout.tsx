import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PinPoint — From datasheet to working code, verified.",
  description:
    "Turn electronics datasheet PDFs into board-specific driver code and wiring guides, verified by a deterministic rules engine.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
