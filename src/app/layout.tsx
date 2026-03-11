import type { Metadata } from "next";
import localFont from 'next/font/local';
import "./globals.css";

const hkGrotesk = localFont({
  src: [
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-light-webfont.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-regular-webfont.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/hkgrotesk/hkgrotesk-bold-webfont.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: "Earnest Page",
  description: "Stop reacting. Start commanding. Build your real-life character bible.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

import { LockedProvider } from "@/context/LockedContext";
import { AuthProvider } from "@/lib/auth/AuthContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${hkGrotesk.variable} antialiased font-sans bg-zinc-950 text-white`}
      >
        <AuthProvider>
          <LockedProvider>
            {children}
          </LockedProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
