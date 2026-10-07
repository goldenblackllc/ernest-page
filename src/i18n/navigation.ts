import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware wrappers around Next.js navigation APIs
export const { Link, usePathname, useRouter } =
  createNavigation(routing);
