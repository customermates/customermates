const ALPHANUMERIC = /\p{L}|\p{N}/u;

export function initialsFor(label: string): string {
  const words = label
    .trim()
    .split(/\s+|@/)
    .filter((w) => ALPHANUMERIC.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const letters = [...words[0]].filter((c) => ALPHANUMERIC.test(c));
    return letters.slice(0, 2).join("").toUpperCase() || "?";
  }
  const first = [...words[0]].find((c) => ALPHANUMERIC.test(c)) ?? "";
  const second = [...words[1]].find((c) => ALPHANUMERIC.test(c)) ?? "";
  return (first + second).toUpperCase() || "?";
}

export function personInitials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}
