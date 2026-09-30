import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trackhunt — Encuentra la próxima versión",
  description: "Identifica una canción por nombre, enlace o audio y explora sus remixes, edits, flips y extendeds en SoundCloud y Bandcamp.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
