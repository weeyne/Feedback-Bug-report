/** The only place in TypeScript where tier limits live. */
export const ENTITLEMENTS = {
  free: {
    maxProjects: 1,
    monthlySubmissions: 20,
    hideBadge: false,
    customCss: false,
    customBot: false,
  },
  pro: {
    maxProjects: Infinity,
    monthlySubmissions: Infinity,
    hideBadge: true,
    customCss: true,
    customBot: true,
  },
} as const;
