export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterSiteUrl: process.env.OPENROUTER_SITE_URL || process.env.APP_URL || 'http://localhost:3000',
  openRouterAppName: process.env.OPENROUTER_APP_NAME || 'Huggy',
  vercelToken: process.env.VERCEL_TOKEN || '',
  huggyPublicDomain: process.env.HUGGY_PUBLIC_DOMAIN || 'huggy.app',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceFree: process.env.STRIPE_PRICE_FREE || '',
  stripePriceStarter: process.env.STRIPE_PRICE_STARTER || '',
  stripePricePro: process.env.STRIPE_PRICE_PRO || '',
  stripePriceStudio: process.env.STRIPE_PRICE_STUDIO || '',
  stripePriceBusiness: process.env.STRIPE_PRICE_BUSINESS || '',
  stripePriceEnterprise: process.env.STRIPE_PRICE_ENTERPRISE || ''
};

export const REQUIRED_SERVER_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'VERCEL_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
] as const;

export function hasSupabaseServerConfig() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function allowLocalMocks() {
  return env.nodeEnv === 'test' || env.nodeEnv === 'development' || env.nodeEnv === 'e2e';
}

export function integrationStatus() {
  return {
    nodeEnv: env.nodeEnv,
    mocksAllowed: allowLocalMocks(),
    supabase: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
    openRouter: Boolean(env.openRouterApiKey),
    vercel: Boolean(env.vercelToken),
    stripe: Boolean(env.stripeSecretKey && env.stripeWebhookSecret),
    publicDomain: Boolean(env.huggyPublicDomain),
    appUrl: Boolean(env.appUrl),
    missing: REQUIRED_SERVER_ENV.filter((key) => !process.env[key])
  };
}
