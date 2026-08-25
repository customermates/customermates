import type { MotionFramePhase, MotionStoryboard } from "./motion-storyboards.data";

import type { ContentLocale } from "@/i18n/locale-registry";

type MotionStoryboardPresentationCopy = {
  dashboard: {
    deals: string;
    status: string;
    total: string;
    totalValue: string;
    widget: string;
  };
  frameLabels: Record<MotionFramePhase, string>;
  frameStates: Record<MotionStoryboard["id"], Record<MotionFramePhase, string> | null>;
  pipeline: {
    activity: Record<"resolved" | "thinking" | "updating", string>;
    assignedUser: string;
    instruction: string;
  };
};

export const MOTION_STORYBOARD_PRESENTATION_COPY = {
  de: {
    dashboard: {
      deals: "Deals",
      status: "Status",
      total: "gesamt",
      totalValue: "Gesamtwert",
      widget: "Deal-Übersicht",
    },
    frameLabels: {
      focal: "Fokus",
      opening: "Start",
      resolved: "Ergebnis",
    },
    frameStates: {
      "agent-pipeline": {
        focal: "Derselbe Deal folgt einem definierten Übergang zu Won und behält währenddessen Open.",
        opening: "Der Deal bleibt in Open, während Claude die gewünschte Statusänderung benennt.",
        resolved: "Der Deal erreicht Won und das Statusergebnis wird eindeutig.",
      },
      "dashboard-insight": {
        focal:
          "Der menschliche Cursor wählt Won; vier Deal-Symbole treten hervor und zeigen einen Gesamtwert von 545.500 €.",
        opening: "Neun vorhandene Deals liegen in den Statusgruppen Open, Won und Lost.",
        resolved: "Won bleibt mit vier Deals und 545.500 € Gesamtwert ausgewählt, nachdem der Cursor verschwindet.",
      },
      "unified-inbox": {
        focal:
          "Annas offene Gmail-Unterhaltung wird zum einzigen aktiven Element, während eine durchgehende Linie den Rand des Kontakts erreicht.",
        opening: "Drei vorhandene Anbieter-Personen-Quellen ruhen still um Anna Müllers Kontakt.",
        resolved:
          "Die Zuordnung zum bestehenden Kontakt ist klar; LinkedIn und WhatsApp bleiben gedämpfter, unverbundener Kontext.",
      },
    },
    pipeline: {
      activity: {
        resolved: "erledigt",
        thinking: "denkt nach",
        updating: "aktualisiert",
      },
      assignedUser: "Zugewiesene Person",
      instruction: "Status auf Won setzen",
    },
  },
  en: {
    dashboard: {
      deals: "deals",
      status: "Status",
      total: "total",
      totalValue: "total value",
      widget: "Deal Overview",
    },
    frameLabels: {
      focal: "Focal",
      opening: "Opening",
      resolved: "Resolved",
    },
    frameStates: {
      "agent-pipeline": null,
      "dashboard-insight": null,
      "unified-inbox": null,
    },
    pipeline: {
      activity: {
        resolved: "resolved",
        thinking: "thinking",
        updating: "updating",
      },
      assignedUser: "Assigned user",
      instruction: "Set Status to Won",
    },
  },
} as const satisfies Record<ContentLocale, MotionStoryboardPresentationCopy>;
