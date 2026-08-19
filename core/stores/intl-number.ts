type LocaleNumberSyntax = {
  decimal: string;
  digits: string[];
  group: string;
  literals: string[];
  minus: string;
  plus: string;
  primaryGroupSize: number;
  secondaryGroupSize: number;
};

const localeNumberSyntax = new Map<string | undefined, LocaleNumberSyntax>();

function getLocaleNumberSyntax(locale: string | undefined): LocaleNumberSyntax {
  const cached = localeNumberSyntax.get(locale);
  if (cached) return cached;

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

  const syntax = { decimal, digits, group, literals, minus, plus, primaryGroupSize, secondaryGroupSize };
  localeNumberSyntax.set(locale, syntax);
  return syntax;
}

function hasValidIntegerGrouping(groups: string[], syntax: LocaleNumberSyntax): boolean {
  if (groups.some((group) => !/^\d+$/u.test(group))) return false;
  if (groups.length === 1) return true;

  const last = groups.at(-1);
  const middle = groups.slice(1, -1);
  return (
    last?.length === syntax.primaryGroupSize &&
    groups[0].length >= 1 &&
    groups[0].length <= syntax.secondaryGroupSize &&
    middle.every((group) => group.length === syntax.secondaryGroupSize)
  );
}

export function parseLocalizedNumberToCanonical(raw: string, locale: string | undefined): string | undefined {
  const syntax = getLocaleNumberSyntax(locale);
  let normalized = raw.trim();
  if (!normalized || normalized === syntax.minus || normalized === syntax.plus) return undefined;

  for (const [digit, localizedDigit] of syntax.digits.entries())
    normalized = normalized.replaceAll(localizedDigit, String(digit));
  for (const literal of syntax.literals) normalized = normalized.replaceAll(literal, "");

  normalized = normalized.replaceAll(syntax.minus, "-").replaceAll(syntax.plus, "+");

  const whitespaceGroup = /^[\s\u00a0\u202f]+$/u.test(syntax.group);
  if (whitespaceGroup) normalized = normalized.replace(/[\s\u00a0\u202f]+/gu, syntax.group);

  const sign = normalized.startsWith("-") || normalized.startsWith("+") ? normalized[0] : "";
  if (sign) normalized = normalized.slice(1);
  if (normalized.includes("-") || normalized.includes("+")) return undefined;

  const decimalParts = normalized.split(syntax.decimal);
  if (decimalParts.length > 2) return undefined;
  const [integerPart, fractionPart] = decimalParts;
  if (
    (!integerPart && !fractionPart) ||
    (fractionPart !== undefined && fractionPart !== "" && !/^\d+$/u.test(fractionPart))
  )
    return undefined;

  const groups = integerPart ? integerPart.split(syntax.group) : ["0"];
  if (!hasValidIntegerGrouping(groups, syntax)) return undefined;

  const integerDigits = groups.join("") || "0";
  const signPrefix = sign === "-" ? "-" : "";
  const canonical = fractionPart ? `${signPrefix}${integerDigits}.${fractionPart}` : `${signPrefix}${integerDigits}`;
  return Number.isFinite(Number(canonical)) ? canonical : undefined;
}

export function parseLocalizedNumber(raw: string, locale: string | undefined): number | undefined {
  const canonical = parseLocalizedNumberToCanonical(raw, locale);
  return canonical === undefined ? undefined : Number(canonical);
}

export function formatLocalizedNumber(
  value: number | undefined,
  locale: string | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(locale, options).format(value);
}
