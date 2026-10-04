export function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC");
}

export function slugifyHeading(heading: string): string {
  return fold(heading)
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
