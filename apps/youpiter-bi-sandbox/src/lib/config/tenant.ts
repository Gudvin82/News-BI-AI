// Tenant config - all client-specific settings come from here or env vars
// This is what makes the product white-labelable
export const tenantConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Taxi BI",
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Taxi Park",
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#F59E0B",
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL ?? "/logo.svg",
  // Integration URLs
  hireLegacyUrl: process.env.TENANT_HIRE_LEGACY_URL ?? "",
  bitrixWebhook: process.env.BITRIX_WEBHOOK ?? "",
  // Feature flags
  features: {
    hireLegacyIframe: !!process.env.TENANT_HIRE_LEGACY_URL,
    ai: true,
    workshop: true,
    cash: true
  }
};
