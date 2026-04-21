import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { LockedProvider } from "@/context/LockedContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { CookieConsent } from "@/components/CookieConsent";

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
    <>
      <ServiceWorkerRegistration />
      <NextIntlClientProvider locale={locale}>
        <AuthProvider>
          <LockedProvider>
            {children}
            <CookieConsent />
          </LockedProvider>
        </AuthProvider>
      </NextIntlClientProvider>
    </>
  );
}
