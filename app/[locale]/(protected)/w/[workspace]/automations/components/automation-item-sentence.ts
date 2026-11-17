import type { useTranslations } from "next-intl";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";
import type { IntlStore } from "@/core/stores/intl.store";
import type { AutomationBuilderModel } from "./automation-builder-model";

import { draftSentence, routineSentence } from "./automation-draft-sentence";
import { ruleToDraft } from "./automation-draft";

type Translate = ReturnType<typeof useTranslations>;

export function automationItemSentence(
  item: AutomationListItemDto,
  model: AutomationBuilderModel,
  t: Translate,
  intlStore: Pick<IntlStore, "formatTime" | "resolvedFormattingLanguageTag">,
): string {
  if (item.routine) return routineSentence(item.routine, t, (date) => intlStore.formatTime(date));
  if (!item.rule) return "";
  return draftSentence(ruleToDraft(item.rule, model, "UTC"), model, t, intlStore.resolvedFormattingLanguageTag);
}
