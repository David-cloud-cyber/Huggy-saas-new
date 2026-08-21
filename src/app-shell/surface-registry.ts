export type HuggySurface = "marketing" | "auth" | "pricing" | "checkout" | "dashboard" | "settings" | "builder" | "admin";

export type SurfaceConfig = {
  id: HuggySurface;
  rootSelector: string;
  theme: "huggy-forge";
  supportsPageTransition: boolean;
  requiresAuth: boolean;
  mobileStrategy: "responsive" | "drawer" | "bottom-sheet";
};

export const HUGGY_SURFACES: Record<HuggySurface, SurfaceConfig> = {
  marketing: { id: "marketing", rootSelector: "[data-huggy-surface='marketing']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: false, mobileStrategy: "responsive" },
  auth: { id: "auth", rootSelector: "[data-huggy-surface='auth']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: false, mobileStrategy: "responsive" },
  pricing: { id: "pricing", rootSelector: "[data-huggy-surface='pricing']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: false, mobileStrategy: "responsive" },
  checkout: { id: "checkout", rootSelector: "[data-huggy-surface='checkout']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: false, mobileStrategy: "bottom-sheet" },
  dashboard: { id: "dashboard", rootSelector: "[data-huggy-surface='dashboard']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: true, mobileStrategy: "drawer" },
  settings: { id: "settings", rootSelector: "[data-huggy-surface='settings']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: true, mobileStrategy: "drawer" },
  builder: { id: "builder", rootSelector: "[data-huggy-surface='builder']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: true, mobileStrategy: "drawer" },
  admin: { id: "admin", rootSelector: "[data-huggy-surface='admin']", theme: "huggy-forge", supportsPageTransition: true, requiresAuth: true, mobileStrategy: "drawer" },
};

export function getSurfaceFromDocument(): SurfaceConfig | null {
  const id = document.body.dataset.huggySurface as HuggySurface | undefined;
  return id ? HUGGY_SURFACES[id] || null : null;
}
