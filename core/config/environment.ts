export type AppMode = "cloud" | "demo" | "self-hosted";
export type Environment = Readonly<Record<string, string | undefined>>;

export function resolveAppMode(source: Environment): AppMode {
  const appMode = source.APP_MODE?.trim();
  if (!appMode) throw new Error("APP_MODE must be configured as self-hosted, cloud, or demo");
  if (appMode !== "self-hosted" && appMode !== "cloud" && appMode !== "demo")
    throw new Error("APP_MODE must be self-hosted, cloud, or demo");
  return appMode;
}
