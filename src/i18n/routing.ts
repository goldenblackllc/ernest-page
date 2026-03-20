import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es', 'pt', 'fr', 'de'],
  defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];
