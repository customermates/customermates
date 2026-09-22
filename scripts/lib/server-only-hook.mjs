const SHIM = new URL("../../tests/helpers/server-only.ts", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: SHIM, shortCircuit: true };
  return nextResolve(specifier, context);
}
