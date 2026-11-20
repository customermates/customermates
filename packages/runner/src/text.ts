export const TEXT_MAX = 4000;
export const DIGEST_MAX = 300;
export const NAME_MAX = 120;
export const ERROR_MAX = 500;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const NUL = /\u0000/g;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

export function storable(text: string): string {
  return text.replace(NUL, "").replace(LONE_SURROGATE, "�");
}

export function clip(text: string, max: number): string {
  const clean = storable(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return isHighSurrogate(cut.charCodeAt(cut.length - 1)) ? cut.slice(0, -1) : cut;
}

export function digest(value: unknown, max: number = DIGEST_MAX): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return clip(value, max);
  try {
    return clip(JSON.stringify(value) ?? "", max);
  } catch {
    return "";
  }
}
