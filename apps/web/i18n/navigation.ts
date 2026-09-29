import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware navigation for the public pages (links keep `/ru` on Russian pages). */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
