const productionApiBaseUrl = "https://mediumturquoise-otter-922125.hostingersite.com";

export const embeddedApiBaseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim() || productionApiBaseUrl;

export function isDeveloperBuild() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

export function resolveApiBaseUrl(settingsApiBaseUrl: string) {
  const localValue = String(settingsApiBaseUrl ?? "").trim();
  if (!isDeveloperBuild() && embeddedApiBaseUrl) return embeddedApiBaseUrl;
  return localValue || embeddedApiBaseUrl || "http://localhost:8787";
}
