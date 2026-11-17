import type { AutomationPaletteKind } from "@/components/automations/automation-palette";

const EFFECT_KINDS = ["setField", "createRecord", "notify", "callWebhook", "agent"] as const;

export type PaletteAvailability = {
  disabled: Set<AutomationPaletteKind>;
  restricted: AutomationPaletteKind[];
};

export function paletteAvailability(chain: {
  hasRecord: boolean;
  canAddCondition: boolean;
  canAddEffect: boolean;
  webhooksVisible: boolean;
}): PaletteAvailability {
  const disabled = new Set<AutomationPaletteKind>();
  const restricted: AutomationPaletteKind[] = [];
  if (!chain.hasRecord || !chain.canAddCondition) disabled.add("condition");
  if (!chain.hasRecord) disabled.add("setField");
  if (!chain.canAddEffect) for (const kind of EFFECT_KINDS) disabled.add(kind);
  if (!chain.webhooksVisible) {
    disabled.add("callWebhook");
    restricted.push("callWebhook");
  }
  return { disabled, restricted };
}
