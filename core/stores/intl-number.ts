function numberSymbols(locale: string | undefined) {
  const format = new Intl.NumberFormat(locale, { useGrouping: true });
  const parts = format.formatToParts(-12345.6);
  const group = parts.find((part) => part.type === "group")?.value ?? ",";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const minus = parts.find((part) => part.type === "minusSign")?.value ?? "-";
  const plus =
    new Intl.NumberFormat(locale, { signDisplay: "always", useGrouping: false })
      .formatToParts(1)
      .find((part) => part.type === "plusSign")?.value ?? "+";
  const literals = [
    ...parts.filter((part) => part.type === "literal").map((part) => part.value),
    ...new Intl.NumberFormat(locale, { signDisplay: "always", useGrouping: false })
      .formatToParts(1)
      .filter((part) => part.type === "literal")
      .map((part) => part.value),
  ];
  const digitFormat = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = Array.from({ length: 10 }, (_, digit) => digitFormat.format(digit));
  const integerParts = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true })
    .formatToParts(1234567890123)
    .filter((part) => part.type === "integer")
    .map((part) => Array.from(part.value).length);
  const primaryGroupSize = integerParts.at(-1) ?? 3;
  const secondaryGroupSize = integerParts.at(-2) ?? primaryGroupSize;

  return { decimal, digits, group, literals, minus, plus, primaryGroupSize, secondaryGroupSize };
}

export function parseLocalizedNumber(raw: string, locale: string | undefined): number | undefined {
  const symbols = numberSymbols(locale);
  let normalized = raw.trim();
  if (!normalized || normalized === symbols.minus || normalized === symbols.plus) return undefined;

  for (const [digit, localizedDigit] of symbols.digits.entries())
    normalized = normalized.replaceAll(localizedDigit, String(digit));
  for (const literal of symbols.literals) normalized = normalized.replaceAll(literal, "");

  normalized = normalized.replaceAll(symbols.minus, "-").replaceAll(symbols.plus, "+");

  const whitespaceGroup = /^[\s\u00a0\u202f]+$/u.test(symbols.group);
  if (whitespaceGroup) normalized = normalized.replace(/[\s\u00a0\u202f]+/gu, symbols.group);

  const sign = normalized.startsWith("-") || normalized.startsWith("+") ? normalized[0] : "";
  if (sign) normalized = normalized.slice(1);
  if (normalized.includes("-") || normalized.includes("+")) return undefined;

  const decimalParts = normalized.split(symbols.decimal);
  if (decimalParts.length > 2) return undefined;
  const [integerPart, fractionPart] = decimalParts;
  if (
    (!integerPart && !fractionPart) ||
    (fractionPart !== undefined && fractionPart !== "" && !/^\d+$/u.test(fractionPart))
  )
    return undefined;

  const groups = integerPart ? integerPart.split(symbols.group) : ["0"];
  if (groups.some((group) => !/^\d+$/u.test(group))) return undefined;
  if (groups.length > 1) {
    const last = groups.at(-1);
    const middle = groups.slice(1, -1);
    if (!last || last.length !== symbols.primaryGroupSize) return undefined;
    if (groups[0].length < 1 || groups[0].length > symbols.secondaryGroupSize) return undefined;
    if (middle.some((group) => group.length !== symbols.secondaryGroupSize)) return undefined;
  }

  const canonical = `${sign}${groups.join("")}${fractionPart === undefined ? "" : `.${fractionPart}`}`;
  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatLocalizedNumber(
  value: number | undefined,
  locale: string | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(locale, options).format(value);
}
