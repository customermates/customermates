/**
 * Auth outcomes — framework-agnostic return shapes for anything that may want
 * the caller to redirect.
 *
 * Why this exists:
 * Auth services and interactors used to call `redirect()` from `next/navigation`
 * directly. That coupled them to Next.js and made them impossible to load inside
 * the trigger.dev worker bundle (which evaluates `react-server` and crashes when
 * `React.createContext` is touched at module load). Returning a discriminated
 * outcome instead keeps the auth layer framework-agnostic; the `next/` adapter
 * in `features/auth/next/require.ts` translates outcomes back into real
 * redirects at the Next.js call site.
 */

export type Redirect = { redirect: string };

export function redirectTo(to: string): Redirect {
  return { redirect: to };
}

export function isRedirect(value: unknown): value is Redirect {
  return (
    typeof value === "object" &&
    value !== null &&
    "redirect" in value &&
    typeof (value as Redirect).redirect === "string"
  );
}
