'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * No `disableTransitionOnChange`: it injects `*{transition:none!important}` while the class
 * flips, which would cancel the theme toggle's knob animation and the `.theme-fading` fallback.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
