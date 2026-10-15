export function emojiFlag(countryCode: string): string {
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}
