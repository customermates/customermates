function withEnding(word: string, ending: string) {
  return word === word.toUpperCase() && /[A-Z]/.test(word) ? `${word}${ending.toUpperCase()}` : `${word}${ending}`;
}

function englishPlural(word: string) {
  if (/[^aeiou]y$/i.test(word)) return withEnding(word.slice(0, -1), "ies");
  if (/(s|x|z|ch|sh)$/i.test(word)) return withEnding(word, "es");
  return withEnding(word, "s");
}

function germanPlural(word: string) {
  if (/(ung|heit|keit|schaft|ion|tät|ei)$/i.test(word)) return withEnding(word, "en");
  if (/(er|el|en|chen|lein)$/i.test(word)) return word;
  if (/e$/i.test(word)) return withEnding(word, "n");
  if (/a$/i.test(word)) return withEnding(word.slice(0, -1), "en");
  if (/[aiouy]$/i.test(word)) return withEnding(word, "s");
  return withEnding(word, "e");
}

function spanishPlural(word: string) {
  if (/z$/i.test(word)) return withEnding(word.slice(0, -1), "ces");
  if (/[aeiouáéó]$/i.test(word)) return withEnding(word, "s");
  if (/s$/i.test(word)) return word;
  return withEnding(word, "es");
}

function frenchPlural(word: string) {
  if (/[sxz]$/i.test(word)) return word;
  if (/(eau|au|eu)$/i.test(word)) return withEnding(word, "x");
  if (/al$/i.test(word)) return withEnding(word.slice(0, -2), "aux");
  return withEnding(word, "s");
}

function italianPlural(word: string) {
  if (/(ca|ga)$/i.test(word)) return withEnding(word.slice(0, -1), "he");
  if (/a$/i.test(word)) return withEnding(word.slice(0, -1), "e");
  if (/[oe]$/i.test(word)) return withEnding(word.slice(0, -1), "i");
  return word;
}

const pluralizers: Record<string, (word: string) => string> = {
  en: englishPlural,
  de: germanPlural,
  es: spanishPlural,
  fr: frenchPlural,
  it: italianPlural,
};

export function suggestListPlural(name: string, locale: string) {
  const trimmed = name.trimEnd();
  const match = /^(.*?)(\p{L}+)$/u.exec(trimmed);
  if (!match) return trimmed;
  const pluralize = pluralizers[locale.slice(0, 2).toLowerCase()] ?? englishPlural;
  return `${match[1]}${pluralize(match[2])}`;
}
