import { action, makeObservable, observable } from "mobx";

export const AUTH_METHODS = ["password", "sso", "magicLink"] as const;

export type AuthMethod = (typeof AUTH_METHODS)[number];

export const AUTH_METHOD_STORAGE_KEY = "customermates:auth:method:v1";

export const MAGIC_LINK_RESEND_COOLDOWN_MS = 60_000;

function isAuthMethod(value: unknown): value is AuthMethod {
  return typeof value === "string" && (AUTH_METHODS as readonly string[]).includes(value);
}

export function readRememberedAuthMethod(): AuthMethod | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
    return isAuthMethod(stored) ? stored : null;
  } catch {
    return null;
  }
}

function rememberAuthMethod(method: AuthMethod) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_METHOD_STORAGE_KEY, method);
  } catch {}
}

export function availableAuthMethods(hasSingleSignOn: boolean): AuthMethod[] {
  return AUTH_METHODS.filter((method) => method !== "sso" || hasSingleSignOn);
}

export class AuthMethodState {
  method: AuthMethod = "password";
  magicLinkSentTo: string | null = null;
  resendAvailableAt = 0;

  constructor(private readonly now: () => number = () => Date.now()) {
    makeObservable(this, {
      method: observable,
      magicLinkSentTo: observable,
      resendAvailableAt: observable,

      setMethod: action,
      restoreMethod: action,
      markMagicLinkSent: action,
      clearMagicLink: action,
    });
  }

  setMethod = (method: AuthMethod) => {
    this.method = method;
    rememberAuthMethod(method);
  };

  restoreMethod = (available: readonly AuthMethod[] = AUTH_METHODS) => {
    const remembered = readRememberedAuthMethod();
    if (remembered && available.includes(remembered)) this.method = remembered;
  };

  markMagicLinkSent = (email: string) => {
    this.magicLinkSentTo = email;
    this.resendAvailableAt = this.now() + MAGIC_LINK_RESEND_COOLDOWN_MS;
  };

  clearMagicLink = () => {
    this.magicLinkSentTo = null;
    this.resendAvailableAt = 0;
  };
}
