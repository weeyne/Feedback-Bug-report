/**
 * Display prices shown in the UI (landing pricing, billing page, upgrade buttons).
 * Display only: what Paddle actually charges comes from the Paddle price ids in the billing
 * config, so change both together.
 */
export const PRICES = { proMonthly: '$9', lifetime: '$49' } as const;
