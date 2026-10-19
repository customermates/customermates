export const GONE = "gone";

export function present<T, F>(result: T | typeof GONE, fallback: F): T | F {
  return result === GONE ? fallback : result;
}
