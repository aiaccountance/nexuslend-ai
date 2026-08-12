export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  // Outfit Arena's own AI key. It reads a dedicated variable first so the
  // fashion app can be billed, rotated and revoked entirely separately from
  // anything the lending product uses; ANTHROPIC_API_KEY is only a fallback
  // for a single-app deployment.
  anthropicApiKey:
    process.env.OUTFIT_ARENA_ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    "",
  // Where uploads go when no S3-backed storage service is configured.
  localStorageDir: process.env.LOCAL_STORAGE_DIR ?? ".local-storage",
};
