import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";

type LoadedRoutine = { ok: true; data: RoutineDto } | { ok: false; error: unknown };

export type FocusedRoutineHandlers = {
  items: readonly AutomationListItemDto[];
  openItem: (item: AutomationListItemDto) => void;
  loadRoutine: (id: string) => Promise<LoadedRoutine>;
  openRoutine: (routine: RoutineDto) => Promise<void> | void;
  onMissing: (error: unknown) => void;
};

export async function openFocusedRoutine(
  id: string,
  handlers: FocusedRoutineHandlers,
): Promise<"listed" | "loaded" | "missing"> {
  const item = handlers.items.find((entry) => entry.id === id && entry.routine);
  if (item) {
    handlers.openItem(item);
    return "listed";
  }
  const loaded = await handlers.loadRoutine(id);
  if (!loaded.ok) {
    handlers.onMissing(loaded.error);
    return "missing";
  }
  await handlers.openRoutine(loaded.data);
  return "loaded";
}
