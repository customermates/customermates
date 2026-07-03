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
