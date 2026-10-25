/**
 * Les scénarios de la suite : des tickets Sentry mockés, avec ce que les
 * outils mockés renvoient et ce qu'on attend de l'agent.
 */
export interface Scenario {
  name: string;
  issue: { id: string; title: string; file: string };
  /** Résultats de gitlab.searchCode : plusieurs fichiers = recherche ambiguë. */
  searchHits: string[];
  /** Le ticket Jira doit aller dans ce projet. */
  expectedProject: string;
}

export const SCENARIOS: Scenario[] = [
  { name: 'npe-checkout-discount', issue: { id: 'PAY-1432', title: 'TypeError in applyDiscount', file: 'checkout/discount.ts' }, searchHits: ['checkout/discount.ts', 'legacy/discount.ts'], expectedProject: 'PAY' },
  { name: 'payment-timeout', issue: { id: 'PAY-1440', title: 'Stripe timeout', file: 'checkout/payment.ts' }, searchHits: ['checkout/payment.ts'], expectedProject: 'PAY' },
  { name: 'cart-empty-state', issue: { id: 'CHK-219', title: 'Empty cart crash', file: 'checkout/cart.ts' }, searchHits: ['checkout/cart.ts'], expectedProject: 'CHK' },
  { name: 'session-expired-loop', issue: { id: 'AUTH-88', title: 'Redirect loop', file: 'auth/session.ts' }, searchHits: ['auth/session.ts'], expectedProject: 'AUTH' },
  { name: 'oauth-callback-500', issue: { id: 'AUTH-95', title: 'OAuth callback 500', file: 'auth/oauth.ts' }, searchHits: ['auth/oauth.ts', 'auth/oauth.test.ts'], expectedProject: 'AUTH' },
  { name: 'search-index-stale', issue: { id: 'SRCH-412', title: 'Stale index', file: 'search/indexer.ts' }, searchHits: ['search/indexer.ts', 'search/indexer.old.ts'], expectedProject: 'SRCH' },
  { name: 'invoice-pdf-blank', issue: { id: 'BILL-77', title: 'Blank invoice PDF', file: 'billing/invoice.ts' }, searchHits: ['billing/invoice.ts'], expectedProject: 'BILL' },
  { name: 'tax-rate-eu', issue: { id: 'BILL-81', title: 'Wrong EU VAT', file: 'billing/tax.ts' }, searchHits: ['billing/tax.ts', 'billing/tax-legacy.ts'], expectedProject: 'BILL' },
];
