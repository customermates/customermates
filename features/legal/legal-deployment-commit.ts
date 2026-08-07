import { env } from "@/env";

export function getLegalDeploymentCommit(): string {
  const commit = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (commit && /^[0-9a-f]{40}$/i.test(commit)) return commit;
  if (env.NODE_ENV === "production")
    throw new Error("VERCEL_GIT_COMMIT_SHA is required for immutable legal-version evidence");

  return "local";
}
