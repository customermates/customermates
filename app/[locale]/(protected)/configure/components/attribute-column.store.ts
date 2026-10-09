import type { FieldModalStore } from "./field-modal";
import type { OptionAttributeColumn, OptionAttributeType } from "./field-option-columns";

import { action, makeObservable } from "mobx";
import { z } from "zod";

import { BaseFormStore } from "@/core/base/base-form.store";
import { attributeKeyTaken, PROBABILITY_ATTRIBUTE } from "./field-option-columns";

function isProbability(key: string) {
  return key.trim().toLowerCase() === PROBABILITY_ATTRIBUTE;
}

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
          })
          .refine((key) => !isProbability(key) || !this.column || this.column.type === "number", {
            message: this.t("RecordModel.probabilityNeedsNumber"),
          }),
        type: z.enum(["number", "text", "boolean", "preserved"]),
      })
      .safeParse(this.form);
    if (!parsed.success) {
      this.setError(z.treeifyError(parsed.error));
      return false;
    }
    const probability = isProbability(parsed.data.key);
    const key = probability ? PROBABILITY_ATTRIBUTE : parsed.data.key;
    if (this.column) this.field.renameAttributeColumn(this.column.id, key);
    else this.field.addAttributeColumn(key, probability ? "number" : parsed.data.type);
    this.onInitOrRefresh(this.form);
    return true;
  };
}
