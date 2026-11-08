import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import AppNavigation from "./AppNavigation";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "Trackhunt — Versiones, sets y mejor calidad";
  const description = "Identifica canciones, explora remixes, convierte tracklists y busca la misma grabación en fuentes oficiales de mejor calidad.";

  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [imageUrl], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body><AppNavigation />{children}</body>
    </html>
  );
}
