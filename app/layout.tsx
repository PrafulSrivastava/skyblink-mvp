import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://skyblink-mvp.vercel.app";
const DESCRIPTION =
  "Flip between NASA infrared images taken years apart and watch nearby stars move across the sky. Five fast movers and variables from SPHEREx and WISE, free and in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SkyBlink: watch the infrared sky move",
    template: "%s · SkyBlink",
  },
  description: DESCRIPTION,
  keywords: ["SPHEREx", "WISE", "astronomy", "infrared", "proper motion", "brown dwarf", "blink comparator"],
  authors: [{ name: "SkyBlink" }],
  openGraph: {
    title: "SkyBlink: watch the infrared sky move",
    description: DESCRIPTION,
    type: "website",
    url: SITE_URL,
    siteName: "SkyBlink",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkyBlink: watch the infrared sky move",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0d14",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
