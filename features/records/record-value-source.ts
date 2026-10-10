import type { RecordFieldView, RecordModelView } from "./record-model.schema";
import type { LinkedHop, SentenceSegment, SentenceValueFormat } from "./calculation-sentence";

import { calculationSentence, fillSentence, linkedFlow } from "./calculation-sentence";

type Translate = (key: string, values?: Record<string, string>) => string;

export type RecordValueSource = { segments: SentenceSegment[]; lookup: LinkedHop | null };

export function recordValueSource({
  model,
  field,
  t,
  format,
}: {
  model: RecordModelView;
  field: Pick<RecordFieldView, "label" | "typeId" | "behavior">;
  t: Translate;
  format: SentenceValueFormat;
}): RecordValueSource | null {
  const sentence = calculationSentence({ model, field, t, format });
  if (!sentence) return null;
  const saved = sentence.saved;
  if (saved) {
    if (saved.kind === "create") {
      const list = model.types.find((type) => type.id === field.typeId)?.label ?? "";
      return { segments: [t("RecordModel.valueSource.savedOnCreate", { list })], lookup: null };
    }
    if (saved.kind === "explicit") return { segments: [t("RecordModel.valueSource.savedOnRequest")], lookup: null };
    const trigger = saved.field ? [saved.field] : [];
    return {
      segments: saved.value
        ? fillSentence({ field: trigger, value: [saved.value] }, (tokens) =>
            t("RecordModel.valueSource.savedWhenChangedTo", tokens),
          )
        : fillSentence({ field: trigger }, (tokens) => t("RecordModel.valueSource.savedWhenChanged", tokens)),
      lookup: null,
    };
  }
  if (sentence.reducer === "one" && sentence.list && sentence.value) {
    const hops =
      field.behavior.kind === "input" || !field.behavior.expression ? [] : linkedFlow(field.behavior.expression).hops;
    return {
      segments: fillSentence({ list: sentence.list, value: sentence.value }, (tokens) =>
        t("RecordModel.valueSource.from", tokens),
      ),
      lookup: hops.length === 1 ? hops[0] : null,
    };
  }
  const formula = sentence.reducer ? sentence.sentence : sentence.value;
  if (!formula) return null;
  return {
    segments: fillSentence({ formula }, (tokens) => t("RecordModel.valueSource.calculated", tokens)),
    lookup: null,
  };
}
