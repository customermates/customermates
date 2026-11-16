import type { RecordField } from "@/features/records/record-model.schema";
import type { PublicFormConfig, PublicFormView } from "./public-form.schema";

import { answerQuestion, isAnswerableField } from "@/features/records/record-value-coercion";

type PresentArgs = {
  config: PublicFormConfig;
  typeId: string;
  modelFields: readonly RecordField[];
  workspaceName: string | null;
  badge: boolean;
  renderToken: string;
};

export function presentPublicForm({
  config,
  typeId,
  modelFields,
  workspaceName,
  badge,
  renderToken,
}: PresentArgs): PublicFormView {
  const fields = config.fields.flatMap((entry) => {
    const field = modelFields.find(
      (candidate) => candidate.id === entry.fieldId && candidate.typeId === typeId && isAnswerableField(candidate),
    );
    const question = field ? answerQuestion(field, entry) : null;
    return question ? [question] : [];
  });

  return {
    title: config.title,
    description: config.description,
    submitLabel: config.submitLabel,
    workspaceName,
    locale: config.locale,
    fields,
    person: config.person ? { emailLabel: config.person.emailLabel, nameLabel: config.person.nameLabel } : null,
    consent: config.consent,
    badge,
    renderToken,
  };
}
