import type { SetupCrawlSource } from "./workspace-setup.repo";

const LEADING_CATEGORIES = ["about", "pricing", "product", "customers", "other"];
const TRAILING_CATEGORIES = ["help", "blog", "policy"];

export type SetupWebsiteBudget = { characters: number; perSource: number };

export function setupWebsiteSources(sources: SetupCrawlSource[]): SetupCrawlSource[] {
  const queues = LEADING_CATEGORIES.map((category) => sources.filter((source) => source.category === category));
  const ordered: SetupCrawlSource[] = [];
  while (queues.some((queue) => queue.length)) for (const queue of queues) ordered.push(...queue.splice(0, 1));
  for (const category of TRAILING_CATEGORIES) ordered.push(...sources.filter((source) => source.category === category));
  const known = new Set([...LEADING_CATEGORIES, ...TRAILING_CATEGORIES]);
  return [...ordered, ...sources.filter((source) => !known.has(source.category))];
}

export function setupWebsiteText(sources: SetupCrawlSource[], budget: SetupWebsiteBudget): string {
  let remaining = budget.characters;
  const entries: string[] = [];
  for (const source of setupWebsiteSources(sources)) {
    if (remaining <= 0) break;
    const entry = `# ${source.title}\n${source.url}\n\n${source.text}`.slice(0, Math.min(budget.perSource, remaining));
    remaining -= entry.length;
    entries.push(entry);
  }
  return entries.join("\n\n");
}
