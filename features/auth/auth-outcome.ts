/**
 * Auth outcomes: framework-agnostic return shapes for anything that may redirect.
 *
 * Auth services and interactors are wired through `core/app-di`, which is also
 * loaded outside the request cycle (background workflow steps, scripts, tests).
 * Calling `redirect()` from `next/navigation` there is wrong: it throws the
 * NEXT_REDIRECT control-flow signal that only resolves at a Next.js request call
 * site, so outside one it just surfaces as an uncaught error. These return a
 * discriminated outcome instead, and the `next/` adapter in
 * `features/auth/next/require.ts` turns it into a real redirect at the call site.
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
