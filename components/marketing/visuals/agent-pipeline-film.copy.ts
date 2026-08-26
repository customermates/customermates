import type { ContentLocale } from "@/i18n/locale-registry";

export const AGENT_PIPELINE_FILM_COPY = {
  de: {
    activity: {
      resolved: "erledigt",
      thinking: "denkt nach",
      updating: "aktualisiert",
    },
    ariaLabel: "Claude aktualisiert den Status von Data & Analytics Transformation von Open auf Won.",
    assignedUser: "Zugewiesene Person",
    instruction: "Status auf Won setzen",
    recordKind: "Deal",
  },
  en: {
    activity: {
      resolved: "resolved",
      thinking: "thinking",
      updating: "updating",
    },
    ariaLabel: "Claude updates Data & Analytics Transformation from Open to Won.",
    assignedUser: "Assigned user",
    instruction: "Set Status to Won",
    recordKind: "Deal",
  },
} as const satisfies Record<
  ContentLocale,
  {
    activity: Record<"resolved" | "thinking" | "updating", string>;
    ariaLabel: string;
    assignedUser: string;
    instruction: string;
    recordKind: string;
  }
>;
