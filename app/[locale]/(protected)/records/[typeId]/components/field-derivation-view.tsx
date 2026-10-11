"use client";

import type { ReactNode } from "react";
import type { ConfirmationSentence } from "@/components/modal/confirmation-sentence";
import type { SentenceModel } from "@/features/records/formula-references";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { ConfirmationSentenceView } from "@/components/modal/confirmation-sentence";

export type FieldDerivationViewProps = {
  field: RecordFieldView;
  model: SentenceModel;
  sentence: ConfirmationSentence;
  diagram?: ReactNode;
};

export function FieldDerivationView(props: FieldDerivationViewProps) {
  return (
    <div data-field-derivation-view={props.field.id}>
      {props.diagram ?? <ConfirmationSentenceView sentence={props.sentence} />}
    </div>
  );
}
