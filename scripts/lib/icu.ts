export function icuArgumentNames(message: string): string {
  const names = new Set<string>();
  parseMessage(message, 0, names);
  return [...names].sort().join(",");
}

export function richTextTagNames(message: string): string {
  const names = new Set<string>();
  for (const match of message.matchAll(/<\s*\/?\s*([A-Za-z][A-Za-z0-9]*)\s*\/?\s*>/g)) names.add(match[1]);
  return [...names].sort().join(",");
}

function parseMessage(text: string, start: number, names: Set<string>): number {
  let index = start;
  while (index < text.length) {
    if (text[index] === "}") return index;
    if (text[index] !== "{") {
      index += 1;
      continue;
    }
    index = parseArgument(text, index + 1, names);
  }
  return index;
}

function parseArgument(text: string, start: number, names: Set<string>): number {
  let index = start;
  while (index < text.length && text[index] !== "," && text[index] !== "}") index += 1;
  const name = text.slice(start, index).trim();
  if (name) names.add(name);
  if (text[index] !== ",") return index + 1;

  index += 1;
  const typeStart = index;
  while (index < text.length && text[index] !== "," && text[index] !== "}") index += 1;
  const type = text.slice(typeStart, index).trim();
  if (text[index] !== ",") return index + 1;

  index += 1;
  if (type === "plural" || type === "select" || type === "selectordinal") {
    while (index < text.length && text[index] !== "}") {
      if (text[index] === "{") {
        index = parseMessage(text, index + 1, names) + 1;
        continue;
      }
      index += 1;
    }
    return index + 1;
  }

  let depth = 1;
  while (index < text.length && depth > 0) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    index += 1;
  }
  return index;
}
