const TRANSLATIONS = new URL("./record-benchmark-translations.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next-intl/server") return { url: TRANSLATIONS, shortCircuit: true };
  return nextResolve(specifier, context);
}
