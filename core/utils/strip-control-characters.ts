const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/gu;

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}
