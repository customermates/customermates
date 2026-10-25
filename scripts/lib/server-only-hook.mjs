const SHIM = new URL("../../tests/helpers/server-only.ts", import.meta.url).href;
const RRULE = new URL("./rrule-commonjs.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: SHIM, shortCircuit: true };
  if (specifier === "rrule") return { url: RRULE, shortCircuit: true };
  return nextResolve(specifier, context);
}
