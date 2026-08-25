import type { ContentLocale } from "@/i18n/locale-registry";

export const UNIFIED_INBOX_FILM_COPY = {
  de: {
    ariaLabel: "Eine eingehende Gmail-Unterhaltung wird Annas bestehendem Kontakt zugeordnet.",
    contactDetail: "Programmmanagerin bei Roche",
    contactEntity: "Kontakt",
    matchedLabel: "Bestehendem Kontakt zugeordnet",
    threadPreview: "Die Einladung ist raus und beide Verantwortlichen für den Piloten haben zugesagt.",
    threadSubject: "Nächste Schritte für den Roche-Rollout",
  },
  en: {
    ariaLabel: "One incoming Gmail conversation resolves to Anna Müller's existing Contact.",
    contactDetail: "Program Manager at Roche",
    contactEntity: "Contact",
    matchedLabel: "Matched to existing contact",
    threadPreview: "The invite is in and both pilot owners confirmed.",
    threadSubject: "Next steps for the Roche rollout",
  },
} as const satisfies Record<
  ContentLocale,
  {
    ariaLabel: string;
    contactDetail: string;
    contactEntity: string;
    matchedLabel: string;
    threadPreview: string;
    threadSubject: string;
  }
>;
