export type ContentKind = "short" | "long" | "overflow" | "de" | "identifier" | "code";

export type OverlayCaseId =
  | "modal-sm"
  | "modal-md"
  | "modal-lg"
  | "modal-xl"
  | "modal-form"
  | "alert-dialog"
  | "command"
  | "sheet-right"
  | "sheet-left"
  | "sheet-top"
  | "sheet-bottom"
  | "drawer-bottom"
  | "popover"
  | "responsive-overlay"
  | "dropdown"
  | "dropdown-sub"
  | "select"
  | "tooltip"
  | "autocomplete"
  | "nested-modal-select"
  | "nested-popover-dropdown";

export const OVERLAY_CASE_IDS: OverlayCaseId[] = [
  "modal-sm",
  "modal-md",
  "modal-lg",
  "modal-xl",
  "modal-form",
  "alert-dialog",
  "command",
  "sheet-right",
  "sheet-left",
  "sheet-top",
  "sheet-bottom",
  "drawer-bottom",
  "popover",
  "responsive-overlay",
  "dropdown",
  "dropdown-sub",
  "select",
  "tooltip",
  "autocomplete",
  "nested-modal-select",
  "nested-popover-dropdown",
];

export const CONTENT_KINDS: ContentKind[] = ["short", "long", "overflow", "de", "identifier", "code"];

export const ANCHOR_CELLS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;

export type AnchorCell = (typeof ANCHOR_CELLS)[number];

export const ANCHOR_CELL_CLASS: Record<AnchorCell, string> = {
  tl: "col-start-1 row-start-1 justify-self-start self-start",
  tc: "col-start-2 row-start-1 justify-self-center self-start",
  tr: "col-start-3 row-start-1 justify-self-end self-start",
  ml: "col-start-1 row-start-2 justify-self-start self-center",
  mc: "col-start-2 row-start-2 justify-self-center self-center",
  mr: "col-start-3 row-start-2 justify-self-end self-center",
  bl: "col-start-1 row-start-3 justify-self-start self-end",
  bc: "col-start-2 row-start-3 justify-self-center self-end",
  br: "col-start-3 row-start-3 justify-self-end self-end",
};

type GermanFixture = { sourceKey: string; value: string; expansion: number };

export const GERMAN_FIXTURES: GermanFixture[] = [
  { sourceKey: "Common.actions.add", value: "Hinzufügen", expansion: 3.33 },
  { sourceKey: "ConnectedAccountsCard.resync", value: "Neu synchronisieren", expansion: 3.17 },
  { sourceKey: "RolesCard.custom", value: "Benutzerdefiniert", expansion: 2.83 },
  { sourceKey: "Common.actions.update", value: "Aktualisieren", expansion: 2.17 },
  { sourceKey: "ThreadSettings.title", value: "Unterhaltungseinstellungen", expansion: 1.0 },
  { sourceKey: "Appearance.toggle", value: "Darstellungsmodus-Umschalter", expansion: 1.0 },
];

export const GERMAN_PARAGRAPH =
  "Die Verbindung zu diesem Konto wird gerade synchronisiert. Unterhaltungseinstellungen und " +
  "Darstellungsmodus-Umschalter bleiben verfügbar, während die Hintergrundsynchronisierung läuft. " +
  "Benutzerdefinierte Felder werden erst nach Abschluss der Aktualisierung vollständig angezeigt.";

export const LONG_PARAGRAPH =
  "This overlay carries enough body copy to exceed the height budget on a small viewport, which is the " +
  "whole point of the fixture. The intended scroll container must take ownership of the overflow while " +
  "the title, the close control and every action in the footer stay reachable. If two containers can " +
  "scroll at once, or the footer leaves the visual viewport, this case fails.";

export const UNBREAKABLE_IDENTIFIER = "whsec_9f2b7c41d83e6a05b1c7e94f20d6a83b5c1e7f409d2a6b8c3e15f7a09d4b2c68";

export const UNBREAKABLE_URL =
  "https://app.customermates.example/webhooks/deliveries/9f2b7c41-d83e-6a05-b1c7-e94f20d6a83b?signature=5c1e7f409d2a6b8c3e15f7a09d4b2c68&attempt=3";

export const CODE_SAMPLE = `{
  "id": "evt_9f2b7c41d83e6a05",
  "type": "messaging.relation.created",
  "payload": { "contactId": "60000000-0000-4000-8000-000000000022", "channel": "linkedin", "handle": "@a-very-long-linkedin-handle-value" }
}`;

export function actionLabels(count: number): string[] {
  const pool = ["Save", "Cancel", "Duplicate", "Archive", "Neu synchronisieren", "Benutzerdefiniert"];
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}
