import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DM_Serif_Display } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400"],
});

const description = "Anonymous real-time chess. Share a link and play.";

export const metadata: Metadata = {
  title: { default: "OpenChess", template: "%s — OpenChess" },
  description,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://openchess.app",
  ),
  openGraph: {
    title: "OpenChess",
    description,
    siteName: "OpenChess",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenChess",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} antialiased`}
      >
        <div className="noise-texture flex min-h-screen flex-col bg-background">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
