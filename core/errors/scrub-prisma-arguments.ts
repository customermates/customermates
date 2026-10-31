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
