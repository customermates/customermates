import type { AppLocale } from "./locale-registry";

import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  appLocaleFromLanguageTag,
  isAppLocale,
  routingLocaleFromPathname,
} from "./locale-registry";

export type GlobalErrorCopy = {
  backLabel: string;
  body: string;
  retryLabel: string;
  subtitle: string;
  title: string;
};

export const GLOBAL_ERROR_COPY = {
  de: {
    backLabel: "Zurück zur Startseite",
    body: "Keine Sorge, wir wurden automatisch über dieses Problem benachrichtigt und kümmern uns bereits darum. Wenn du sofortige Hilfe benötigst, kannst du dich gerne an unser Support-Team wenden.",
    retryLabel: "Erneut versuchen",
    subtitle: "Ups! Etwas ist schiefgelaufen",
    title: "Das ist jetzt peinlich",
  },
  en: {
    backLabel: "Back to home",
    body: "Don't worry, we've been automatically notified about this issue and are already looking into it. If you need immediate assistance, feel free to reach out to our support team.",
    retryLabel: "Try again",
    subtitle: "Oops! Something went wrong",
    title: "Well, that's awkward",
  },
  es: {
    backLabel: "Volver al inicio",
    body: "Tranquilo, se nos ha avisado automáticamente de este problema y ya lo estamos revisando. Si necesitas ayuda inmediata, no dudes en contactar con nuestro equipo de soporte.",
    retryLabel: "Inténtalo de nuevo",
    subtitle: "¡Vaya! Algo ha fallado",
    title: "Qué incómodo",
  },
  fr: {
    backLabel: "Retour à l'accueil",
    body: "Rassurez-vous, nous avons été automatiquement informés de ce problème et nous nous en occupons déjà. Si vous avez besoin d'aide immédiatement, n'hésitez pas à contacter notre assistance.",
    retryLabel: "Réessayer",
    subtitle: "Oups ! Une erreur est survenue",
    title: "Voilà qui est gênant",
  },
  it: {
    backLabel: "Torna alla home",
    body: "Non preoccuparti, siamo stati avvisati automaticamente di questo problema e ce ne stiamo già occupando. Se ti serve aiuto subito, contatta pure il nostro team di assistenza.",
    retryLabel: "Riprova",
    subtitle: "Ops! Si è verificato un errore",
    title: "Che imbarazzo",
  },
} satisfies Record<AppLocale, GlobalErrorCopy>;

export function resolveGlobalErrorLocale(pathname: string, languages: readonly string[]): AppLocale {
  const routeLocale = routingLocaleFromPathname(pathname);
  if (isAppLocale(routeLocale)) return routeLocale;

  for (const language of languages) {
    const locale = appLocaleFromLanguageTag(language);
    if (locale) return locale;
  }

  return DEFAULT_LOCALE;
}

export function globalErrorFallback(): { copy: GlobalErrorCopy; locale: AppLocale } {
  if (typeof window === "undefined") return defaultGlobalErrorFallback();

  const locale = resolveGlobalErrorLocale(window.location.pathname, navigator.languages);
  return { copy: GLOBAL_ERROR_COPY[locale], locale };
}

export function defaultGlobalErrorFallback(): { copy: GlobalErrorCopy; locale: AppLocale } {
  return { copy: GLOBAL_ERROR_COPY[DEFAULT_LOCALE], locale: DEFAULT_LOCALE };
}

export function assertGlobalErrorCopyCoverage(): boolean {
  return APP_LOCALES.every((locale) => Boolean(GLOBAL_ERROR_COPY[locale]));
}
