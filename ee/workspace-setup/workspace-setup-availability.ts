import { env } from "@/env";

export function workspaceSetupUnavailability(): "selfHosted" | "demo" | null {
  if (env.APP_MODE === "self-hosted") return "selfHosted";
  if (env.APP_MODE === "demo") return "demo";
  return null;
}
