import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/SiteHeader";
import { HOME_BLURB } from "@/lib/copy";
import "./globals.css";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000",
  ),
  title: {
    default: "Tradeviction",
    template: "%s | Tradeviction",
  },
  description: HOME_BLURB,
  openGraph: {
    type: "website",
    siteName: "Tradeviction",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml",
      sizes: "any",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} antialiased`}>
      <body className="bg-bg font-sans text-ink">
        <div className="mx-auto min-h-screen min-w-0 max-w-[56rem] px-4 sm:px-5 md:px-10">
          <SiteHeader />
          <main className="pt-3 pb-16">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
