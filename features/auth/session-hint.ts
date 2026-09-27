export const SESSION_HINT_COOKIE_NAME = "app.session_hint";

export const SESSION_HINT_MAX_AGE = 30 * 24 * 60 * 60;

export function hasSessionHint(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((entry) => entry.trim().startsWith(`${SESSION_HINT_COOKIE_NAME}=`));
}

export function sessionHintCookie(): string {
  return `${SESSION_HINT_COOKIE_NAME}=1; Path=/; Max-Age=${SESSION_HINT_MAX_AGE}; SameSite=Lax`;
}

export function expiredSessionHintCookie(): string {
  return `${SESSION_HINT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
