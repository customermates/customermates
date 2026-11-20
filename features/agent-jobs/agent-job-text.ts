const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const REPLACEMENT = "�";

function endsInsidePair(text: string): boolean {
  const last = text.charCodeAt(text.length - 1);
  return last >= 0xd800 && last <= 0xdbff;
}

export function storableText(text: string): string {
  return text.replaceAll("\u0000", "").replace(LONE_SURROGATE, REPLACEMENT);
}

export function clipText(text: string, max: number): string {
  const clean = storableText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return endsInsidePair(cut) ? cut.slice(0, -1) : cut;
}
