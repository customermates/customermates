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
  unreportedBody: string;
};

export const GLOBAL_ERROR_COPY = {
  de: {
    backLabel: "Zurück zur Startseite",
    body: "Bitte versuche es erneut. Wenn das Problem bleibt, wende dich an den Support.",
    retryLabel: "Erneut versuchen",
    subtitle: "Ups! Etwas ist schiefgelaufen",
    title: "Das ist jetzt peinlich",
    unreportedBody:
      "Bitte versuche es erneut. Wenn das Problem bleibt, wende dich an die Person, die diese Customermates-Instanz betreibt.",
  },
  en: {
    backLabel: "Back to home",
    body: "Please try again. If the problem continues, contact support.",
    retryLabel: "Try again",
    subtitle: "Oops! Something went wrong",
    title: "Well, that's awkward",
    unreportedBody:
      "Please try again. If the problem continues, contact the person who runs this Customermates instance.",
  },
  es: {
    backLabel: "Volver al inicio",
    body: "Vuelve a intentarlo. Si el problema continúa, contacta con soporte.",
    retryLabel: "Inténtalo de nuevo",
    subtitle: "¡Vaya! Algo ha fallado",
    title: "Qué incómodo",
    unreportedBody:
      "Vuelve a intentarlo. Si el problema continúa, contacta con la persona que administra esta instancia de Customermates.",
  },
  fr: {
    backLabel: "Retour à l’accueil",
    body: "Veuillez réessayer. Si le problème persiste, contactez l’assistance.",
    retryLabel: "Réessayer",
    subtitle: "Oups\u00a0! Une erreur est survenue",
    title: "Voilà qui est gênant",
    unreportedBody:
      "Veuillez réessayer. Si le problème persiste, contactez la personne qui gère cette instance de Customermates.",
  },
  it: {
    backLabel: "Torna alla home",
    body: "Riprova. Se il problema persiste, contatta l’assistenza.",
    retryLabel: "Riprova",
    subtitle: "Ops! Si è verificato un errore",
    title: "Che imbarazzo",
    unreportedBody:
      "Riprova. Se il problema persiste, contatta la persona che gestisce questa istanza di Customermates.",
  },
  pt: {
    backLabel: "Voltar ao início",
    body: "Tente novamente. Se o problema continuar, entre em contato com o suporte.",
    retryLabel: "Tentar novamente",
    subtitle: "Ops! Algo deu errado",
    title: "Bom, que situação constrangedora",
    unreportedBody:
      "Tente novamente. Se o problema continuar, entre em contato com a pessoa que administra esta instância do Customermates.",
  },
  pl: {
    backLabel: "Wróć na stronę główną",
    body: "Spróbuj ponownie. Jeśli problem się powtarza, skontaktuj się z pomocą techniczną.",
    retryLabel: "Spróbuj ponownie",
    subtitle: "Ups! Coś poszło nie tak",
    title: "No cóż, to niezręczne",
    unreportedBody:
      "Spróbuj ponownie. Jeśli problem się powtarza, skontaktuj się z osobą, która zarządza tą instancją Customermates.",
  },
  nl: {
    backLabel: "Terug naar home",
    body: "Probeer het opnieuw. Blijft het probleem bestaan, neem dan contact op met de support.",
    retryLabel: "Opnieuw proberen",
    subtitle: "Oeps! Er is iets misgegaan",
    title: "Nou, dit is gênant",
    unreportedBody:
      "Probeer het opnieuw. Als het probleem blijft, neem dan contact op met de persoon die deze Customermates-instantie beheert.",
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
