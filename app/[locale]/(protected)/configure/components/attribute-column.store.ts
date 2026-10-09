import type { FieldModalStore } from "./field-modal";
import type { OptionAttributeColumn, OptionAttributeType } from "./field-option-columns";

import { action, makeObservable } from "mobx";
import { z } from "zod";

import { BaseFormStore } from "@/core/base/base-form.store";
import { attributeKeyTaken, PROBABILITY_ATTRIBUTE } from "./field-option-columns";

export class AttributeColumnStore extends BaseFormStore<{ key: string; type: OptionAttributeType }> {
  constructor(
    private readonly field: FieldModalStore,
    private readonly columnId?: string,
  ) {
    super(field.rootStore, { key: "", type: "number" });
    makeObservable(this, { start: action, submit: action });
  }

  get column(): OptionAttributeColumn | undefined {
    return this.field.form.choices.columns.find((column) => column.id === this.columnId);
  }

  start = () => {
    this.onInitOrRefresh({ key: this.column?.key ?? "", type: this.column?.type ?? "number" });
  };

  submit = () => {
    const parsed = z
      .object({
        key: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine((key) => !attributeKeyTaken(this.field.form.choices.columns, key, this.column?.id), {
            message: this.t("RecordModel.attributeNameTaken"),
          }),
        type: z.enum(["number", "text", "boolean", "preserved"]),
      })
      .safeParse(this.form);
    if (!parsed.success) {
      this.setError(z.treeifyError(parsed.error));
      return false;
    }
    if (this.column) this.field.renameAttributeColumn(this.column.id, parsed.data.key);
    else {
      this.field.addAttributeColumn(
        parsed.data.key,
        parsed.data.key === PROBABILITY_ATTRIBUTE ? "number" : parsed.data.type,
      );
    }
    this.onInitOrRefresh(this.form);
    return true;
  };
}
