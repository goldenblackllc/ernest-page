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
  description: "A Life Operating System.",
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
