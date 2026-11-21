import type { LucideIcon } from "lucide-react";
import type { AutomationPaletteKind, AutomationPaletteReasons } from "@/components/automations/automation-palette";

export type AutomationStepTone = "trigger" | "condition" | "action" | "agent" | "empty";

export type AutomationRunMark = "ok" | "failed" | "skipped";

export type AutomationCanvasStep = {
  id: string;
  tone: AutomationStepTone;
  icon: LucideIcon;
  label: string;
  sentence: string;
  badge?: string;
  invalid?: boolean;
  fixed?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canDuplicate?: boolean;
  mark?: AutomationRunMark | null;
};

export type AutomationCanvasPalette = {
  disabled: ReadonlySet<AutomationPaletteKind>;
  reasons?: AutomationPaletteReasons;
};

export type AutomationCanvasActions = {
  selected: string | null;
  paletteAt: number | null;
  palette: AutomationCanvasPalette | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onOpenPalette: (index: number | null) => void;
  onPick: (index: number, kind: AutomationPaletteKind) => void;
  onMove?: (id: string, delta: -1 | 1) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
};
