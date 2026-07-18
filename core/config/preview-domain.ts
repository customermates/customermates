export type PreviewDomain = Readonly<{
  branch: string;
  hostname: string;
  label: string;
}>;

const PREVIEW_BRANCH_PREFIXES = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "feature",
  "fix",
  "perf",
  "refactor",
  "revert",
  "sandbox",
  "style",
  "test",
]);

const RESERVED_PREVIEW_LABELS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cdn",
  "customermates",
  "demo",
  "dev",
  "development",
  "docs",
  "help",
  "internal",
  "login",
  "mail",
  "main",
  "mcp",
  "preview",
  "prod",
  "production",
  "security",
  "staging",
  "static",
  "status",
  "support",
  "test",
  "www",
]);

const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizePreviewDomain(rawValue: string): string {
  const domain = rawValue.trim();

  if (!domain || domain !== domain.toLowerCase() || domain.includes("*") || domain.endsWith("."))
    throw new Error("PREVIEW_DOMAIN must be a lowercase DNS hostname without a wildcard or trailing dot");

  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 || labels.some((label) => !DNS_LABEL_PATTERN.test(label)))
    throw new Error("PREVIEW_DOMAIN must be a valid DNS hostname");

  if (labels.some((label) => label.startsWith("xn--")))
    throw new Error("PREVIEW_DOMAIN must use plain ASCII DNS labels");

  return domain;
}

export function resolvePreviewDomain(branch: string | undefined, rawDomain: string): PreviewDomain | null {
  const domain = normalizePreviewDomain(rawDomain);
  if (!branch || branch !== branch.trim()) return null;

  const [prefix, branchLabel, ...extraParts] = branch.split("/");
  if (!prefix || prefix !== prefix.toLowerCase() || !PREVIEW_BRANCH_PREFIXES.has(prefix)) return null;
  if (!branchLabel || extraParts.length > 0 || !DNS_LABEL_PATTERN.test(branchLabel)) return null;
  if (branchLabel.startsWith("xn--")) return null;

  const reservedSandboxPrefix = [...PREVIEW_BRANCH_PREFIXES].some((value) => branchLabel.startsWith(`${value}-`));
  if (prefix === "sandbox" && (RESERVED_PREVIEW_LABELS.has(branchLabel) || reservedSandboxPrefix)) return null;

  const label = prefix === "sandbox" ? branchLabel : `${prefix}-${branchLabel}`;
  if (!DNS_LABEL_PATTERN.test(label)) return null;

  return {
    branch,
    hostname: `${label}.${domain}`,
    label,
  };
}
