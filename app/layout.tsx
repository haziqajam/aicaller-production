import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Jerali", template: "%s · Jerali" },
  description: "Jerali — AI-powered voice calling platform for campaigns and assistants.",
  // The app ships its own dark theme; this tells the Dark Reader browser extension
  // NOT to re-theme the page. Without it, Dark Reader rewrites every SVG's stroke
  // (breaking React hydration) and mis-colors the OKLCH theme (the "all red" UI).
  other: { "darkreader-lock": "true" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* No-flash theme: server-rendered script runs before paint. Rendering
            this from a Server Component avoids React 19.2's client script-tag
            warning that next-themes triggered. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
