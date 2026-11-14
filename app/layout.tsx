import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkyBlink — Watch the infrared sky move",
  description:
    "Type any sky coordinates and play SPHEREx infrared images as a blink. Spot proper motion, extract spectra. No FITS files needed.",
  keywords: ["SPHEREx", "astronomy", "infrared", "proper motion", "brown dwarf", "blink comparator"],
  authors: [{ name: "SkyBlink" }],
  openGraph: {
    title: "SkyBlink — Watch the infrared sky move",
    description: "SPHEREx blink comparator + 102-channel spectra. No login required.",
    type: "website",
  },
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
