// Vercel's ignored build step (vercel.json ignoreCommand): exit 0 skips the deployment, exit 1 builds it.
// Production and the Demo environment always build. A preview builds only for an SEO daily branch, whose pull
// request is reviewed on its preview, or for a branch whose open pull request carries the `preview` label. Adding the
// label later starts the preview through .github/workflows/preview-deploy.yml, because Vercel does not re-run this
// step on a label change. When GitHub cannot be asked, the preview is skipped and the log says how to start it.

import { pathToFileURL } from "node:url";

export const PREVIEW_LABEL = "preview";
export const PREVIEW_BRANCH_PREFIXES = ["feat/seo-daily-"];

export function decideWithoutLabels(env) {
  if (env.VERCEL_ENV !== "preview") return { build: true, reason: `${env.VERCEL_ENV || "unknown"} deployment` };
  if (env.VERCEL_TARGET_ENV === "demo") return { build: true, reason: "Demo environment" };
  const branch = env.VERCEL_GIT_COMMIT_REF ?? "";
  if (branch === "main") return { build: true, reason: "main branch" };
  if (PREVIEW_BRANCH_PREFIXES.some((prefix) => branch.startsWith(prefix)))
    return { build: true, reason: `preview branch ${branch}` };
  if (!branch || env.VERCEL_GIT_PROVIDER !== "github" || !env.VERCEL_GIT_REPO_OWNER || !env.VERCEL_GIT_REPO_SLUG)
    return { build: false, reason: "preview without a GitHub branch" };
  return null;
}

export async function pullRequestLabels(env, fetchImpl = fetch) {
  const repository = `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`;
  const pullRequest = /^[1-9][0-9]*$/.test(env.VERCEL_GIT_PULL_REQUEST_ID ?? "") ? env.VERCEL_GIT_PULL_REQUEST_ID : "";
  const url = pullRequest
    ? `https://api.github.com/repos/${repository}/pulls/${pullRequest}`
    : `https://api.github.com/repos/${repository}/pulls?state=open&per_page=10&head=${encodeURIComponent(
        `${env.VERCEL_GIT_REPO_OWNER}:${env.VERCEL_GIT_COMMIT_REF}`,
      )}`;
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "customermates-vercel-ignore-build" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const body = await response.json();
  const pulls = Array.isArray(body) ? body : [body];
  return pulls
    .filter((pull) => pull.state === "open" && pull.head?.ref === env.VERCEL_GIT_COMMIT_REF)
    .flatMap((pull) => (pull.labels ?? []).map((label) => label.name));
}

export async function decide(env, fetchImpl = fetch) {
  const fixed = decideWithoutLabels(env);
  if (fixed) return fixed;
  const branch = env.VERCEL_GIT_COMMIT_REF;
  try {
    const labels = await pullRequestLabels(env, fetchImpl);
    if (labels.includes(PREVIEW_LABEL))
      return { build: true, reason: `pull request of ${branch} has the ${PREVIEW_LABEL} label` };
    return {
      build: false,
      reason: `no open pull request of ${branch} has the ${PREVIEW_LABEL} label; add the label to build a preview`,
    };
  } catch (error) {
    return {
      build: false,
      reason: `could not read the pull request labels of ${branch} (${error.message}); run the "Preview deployment" workflow for this branch to build its preview`,
    };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { build, reason } = await decide(process.env);
  console.log(`${build ? "Building" : "Skipping the build"}: ${reason}.`);
  process.exit(build ? 1 : 0);
}
