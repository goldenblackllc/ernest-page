import type { Metadata, Viewport } from "next";
import localFont from 'next/font/local';
import "../globals.css";

const hkGrotesk = localFont({
  src: [
    {
      path: '../../../public/fonts/hkgrotesk/hkgrotesk-light-webfont.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/hkgrotesk/hkgrotesk-regular-webfont.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../public/fonts/hkgrotesk/hkgrotesk-bold-webfont.woff2',
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { LockedProvider } from "@/context/LockedContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${hkGrotesk.variable} antialiased font-sans bg-zinc-950 text-white`}
      >
        <ServiceWorkerRegistration />
        <NextIntlClientProvider locale={locale}>
          <AuthProvider>
            <LockedProvider>
              {children}
            </LockedProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
