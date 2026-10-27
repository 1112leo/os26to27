// Bindings are generated from wrangler.jsonc by `npm run types`.
export type Env = Omit<CloudflareBindings, 'EVENT_PHASE' | 'RATE_LIMITER'> & {
  EVENT_PHASE: string;
  RATE_LIMITER: Pick<Fetcher, 'fetch'>;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};
