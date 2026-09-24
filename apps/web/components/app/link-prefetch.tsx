'use client';

import Link from 'next/link';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

/**
 * The prefetch policy of every `AppLink` below it: `null` (the default) keeps Next's default
 * prefetching; `false` turns prefetching off. Only the landing demo's /demo/dashboard sets `false`:
 * it renders the real dashboard shell with real `/app/*` links, and prefetching them on every demo
 * loop would run the proxy (and, for a signed-in visitor, server renders with database lookups)
 * for pages nobody can open from the inert demo iframe.
 */
export const LinkPrefetchContext = createContext<false | null>(null);

export function LinkPrefetchProvider({
  prefetch,
  children,
}: {
  prefetch: false | null;
  children: ReactNode;
}) {
  return <LinkPrefetchContext value={prefetch}>{children}</LinkPrefetchContext>;
}

/**
 * `next/link` that follows `LinkPrefetchContext`. A client component, so server components (the
 * dashboard shell, feed, detail panel) use it too: it reads the context wherever it renders.
 */
export function AppLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
  const policy = useContext(LinkPrefetchContext);
  return <Link prefetch={policy === false ? false : prefetch} {...props} />;
}
