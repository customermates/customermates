const PLAIN_DECIMAL_NUMBER = /^-?\d+(?:\.\d+)?$/u;

const NUMBER_VALUE_EXEMPT_OPERATORS = new Set(["inLastDays"]);

const EXPONENTIAL_NUMBER = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/u;

function expandExponential(text: string): string {
  const match = EXPONENTIAL_NUMBER.exec(text);
  if (!match) return text;

  const [, sign, integerDigits, fractionDigits = "", exponentText] = match;
  const digits = `${integerDigits}${fractionDigits}`;
  const pointIndex = integerDigits.length + Number(exponentText);

  if (pointIndex <= 0) return `${sign}0.${"0".repeat(-pointIndex)}${digits}`;
  if (pointIndex >= digits.length) return `${sign}${digits}${"0".repeat(pointIndex - digits.length)}`;

  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

export function canonicalFilterNumber(value: number): string | undefined {
  if (!Number.isFinite(value)) return undefined;

  const direct = String(value);
  if (PLAIN_DECIMAL_NUMBER.test(direct)) return direct;

  const expanded = expandExponential(direct);

  return PLAIN_DECIMAL_NUMBER.test(expanded) ? expanded : undefined;
}

export function filterNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function canonicalFilterValue(value: unknown): unknown {
  if (typeof value !== "number") return value;

  return canonicalFilterNumber(value) ?? value;
}

export function normalizeFilterNumberValueInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const filter = input as Record<string, unknown>;
  if (!("value" in filter)) return input;
  if (NUMBER_VALUE_EXEMPT_OPERATORS.has(filter.operator as string)) return input;

  const { value } = filter;

  if (Array.isArray(value)) {
    if (!value.some((entry) => typeof entry === "number")) return input;

    return { ...filter, value: value.map(canonicalFilterValue) };
  }

  const canonical = canonicalFilterValue(value);

  return canonical === value ? input : { ...filter, value: canonical };
}
