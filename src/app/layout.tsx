import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Niaga — Manajemen Bisnis",
  description:
    "Harga, pelanggan, invoice, dan pembayaran dalam satu ruang kerja.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
