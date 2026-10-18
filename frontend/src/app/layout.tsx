import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Onest } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
});

const SITE = "https://farmas-six.vercel.app";
const TITLE = "FarmAs — Your AI Farm Companion";
const DESCRIPTION =
  "FarmAs turns everyday farm conversations into intelligent records, insights, health guidance and early warnings.";

export const metadata: Metadata = {
  // Lets the share image and icons be found at full web addresses, which link previews need.
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "FarmAs",
  openGraph: {
    type: "website",
    siteName: "FarmAs",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE,
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  appleWebApp: { capable: true, title: "FarmAs", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07260d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${onest.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
