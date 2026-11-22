import { env } from "@/env";

import { GITHUB_REPOSITORY_API_URL } from "./github-repository";

export const GITHUB_STARS_REVALIDATE_SECONDS = 3600;

export async function getGithubStarCount(): Promise<number | null> {
  if (env.APP_MODE === "self-hosted") return null;

  try {
    const response = await fetch(GITHUB_REPOSITORY_API_URL, {
      next: { revalidate: GITHUB_STARS_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const stars =
      typeof data === "object" && data !== null && "stargazers_count" in data ? data.stargazers_count : null;
    return typeof stars === "number" ? stars : null;
  } catch {
    return null;
  }
}
