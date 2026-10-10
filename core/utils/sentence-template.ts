const TOKEN = "\u0000";

export function sentenceTemplate<T>(
  translate: (tokens: Record<string, string>) => string,
  values: Record<string, ReadonlyArray<string | T>>,
): Array<string | T> {
  const names = Object.keys(values);
  const text = translate(Object.fromEntries(names.map((name, index) => [name, `${TOKEN}${index}${TOKEN}`])));
  return text
    .split(TOKEN)
    .flatMap((part, index) => (index % 2 === 0 ? (part ? [part] : []) : [...values[names[Number(part)]]]));
}
