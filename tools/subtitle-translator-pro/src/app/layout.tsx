import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subtitle Translator Pro",
  description:
    "Traduce archivos de subtítulos .srt y .vtt conservando tiempos, numeración y formato original.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
