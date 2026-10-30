type ScrubbableEvent = {
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  message?: string;
  logentry?: { message?: string; formatted?: string; params?: unknown[] };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

const MAX_SCRUB_DEPTH = 6;

const PRISMA_INVOCATION = /Invalid `(?:[\w$]+\.)*([\w$]+)\.([\w$]+)\(\)` invocation/;

const QUOTED_IDENTIFIER = /`([\w$]+)`/g;

export function scrubPrismaArgumentsFromMessage(message: string): string {
  const invocation = PRISMA_INVOCATION.exec(message);
  if (!invocation) return message;

  const [, model, operation] = invocation;
  const diagnostic =
    message
      .trim()
      .split(/\n\s*\n/)
      .at(-1) ?? "";
  const fields = diagnostic.includes(invocation[0])
    ? []
    : [...new Set([...diagnostic.matchAll(QUOTED_IDENTIFIER)].map(([, field]) => field))];

  return `Invalid prisma.${model}.${operation}() invocation${fields.length ? `: arguments ${fields.join(", ")}` : ""}`;
}

function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubPrismaArgumentsFromMessage(value) as T;
  if (value instanceof Error) return `${value.name}: ${scrubPrismaArgumentsFromMessage(value.message)}` as T;
  if (!value || typeof value !== "object" || depth >= MAX_SCRUB_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1)) as T;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth + 1)])) as T;
}

export function scrubPrismaArgumentsFromEvent<T extends ScrubbableEvent>(event: T): T {
  for (const exception of event.exception?.values ?? [])
    if (exception.value) exception.value = scrubPrismaArgumentsFromMessage(exception.value);

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubPrismaArgumentsFromMessage(breadcrumb.message);
    if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data);
  }

  if (event.message) event.message = scrubPrismaArgumentsFromMessage(event.message);
  if (event.logentry) event.logentry = scrubValue(event.logentry);
  if (event.extra) event.extra = scrubValue(event.extra);
  if (event.contexts) event.contexts = scrubValue(event.contexts);

  return event;
}
