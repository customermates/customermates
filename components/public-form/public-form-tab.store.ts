import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";
import type {
  PublicFormConfig,
  PublicFormEditor,
  PublicFormView,
  UpsertPublicFormData,
} from "@/features/public-form/public-form.schema";
import type { AfterSubmitChain } from "./public-form-after-submit";
import type { DraftTexts, FormDraft } from "./public-form-draft";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { afterSubmitChain } from "./public-form-after-submit";
import { initialDraft, previewForm, validDraftConfig } from "./public-form-draft";

export type PublicFormActionResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

export type PublicFormTabActions = {
  loadEditor: (typeId: string) => Promise<PublicFormActionResult<PublicFormEditor>>;
  save: (input: UpsertPublicFormData) => Promise<PublicFormActionResult<unknown>>;
  loadRules: () => Promise<PublicFormActionResult<{ items: AutomationRuleDto[] }>>;
};

export type PublicFormLoadOutcome = { status: "loaded" } | { status: "failed"; error: unknown } | { status: "stale" };

export type PublicFormSaveOutcome = { status: "saved" } | { status: "failed"; error: unknown } | { status: "skipped" };

export type PublicFormPreviewMode = "form" | "done";

export class PublicFormTabStore {
  editor: PublicFormEditor | null = null;
  draft: FormDraft | null = null;
  rules: AutomationRuleDto[] = [];
  baseline = "";
  saving = false;
  previewMode: PublicFormPreviewMode = "form";
  private request = 0;

  constructor(
    readonly typeId: string,
    private readonly actions: PublicFormTabActions,
  ) {
    makeObservable(this, {
      editor: observable.ref,
      draft: observable.ref,
      rules: observable.ref,
      baseline: observable,
      saving: observable,
      previewMode: observable,
      edited: computed,
      config: computed,
      canSave: computed,
      preview: computed,
      chain: computed,
      patch: action,
      setPreviewMode: action,
      addConsentLine: action,
      removeConsentLine: action,
      moveField: action,
    });
  }

  get edited(): boolean {
    return this.draft !== null && JSON.stringify(this.draft) !== this.baseline;
  }

  get config(): PublicFormConfig | null {
    return this.draft ? validDraftConfig(this.draft) : null;
  }

  get canSave(): boolean {
    return this.edited && this.config !== null && !this.saving;
  }

  get preview(): PublicFormView | null {
    return this.draft && this.editor ? previewForm(this.draft, this.editor, null) : null;
  }

  get chain(): AfterSubmitChain | null {
    const { draft, editor } = this;
    if (!draft || !editor) return null;
    const people = draft.personEnabled ? editor.peopleLists.find((list) => list.typeId === draft.personTypeId) : null;
    return afterSubmitChain(
      this.rules,
      { id: editor.form?.id ?? null, typeId: this.typeId },
      people?.label ?? (draft.personEnabled ? (editor.peopleLists[0]?.label ?? null) : null),
    );
  }

  load = async (texts: DraftTexts): Promise<PublicFormLoadOutcome> => {
    const current = ++this.request;
    const [result, rules] = await Promise.all([this.actions.loadEditor(this.typeId), this.readRules()]);
    if (current !== this.request) return { status: "stale" };
    if (!result.ok) return { status: "failed", error: result.error };

    const next = initialDraft(result.data, texts);
    runInAction(() => {
      this.editor = result.data;
      this.draft = next;
      this.baseline = JSON.stringify(next);
      this.rules = rules;
    });
    return { status: "loaded" };
  };

  private readRules = async (): Promise<AutomationRuleDto[]> => {
    try {
      const result = await this.actions.loadRules();
      return result.ok ? result.data.items : [];
    } catch {
      return [];
    }
  };

  patch = (next: Partial<FormDraft>) => {
    if (this.draft) this.draft = { ...this.draft, ...next };
  };

  setPreviewMode = (mode: PublicFormPreviewMode) => {
    this.previewMode = mode;
  };

  addConsentLine = (defaultText: string) => {
    const text = this.draft?.consentText.trim() ?? "";
    this.patch({ consentEnabled: true, consentText: text.length > 0 ? text : defaultText });
  };

  removeConsentLine = () => {
    this.patch({ consentEnabled: false });
  };

  moveField = (index: number, offset: -1 | 1) => {
    if (!this.draft) return;
    const target = index + offset;
    const fields = [...this.draft.fields];
    if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    this.patch({ fields });
  };

  save = async (): Promise<PublicFormSaveOutcome> => {
    const { editor, draft, config } = this;
    if (!editor || !draft || !config || this.saving) return { status: "skipped" };

    runInAction(() => {
      this.saving = true;
    });
    try {
      const result = await this.actions.save({
        ...(editor.form ? { id: editor.form.id } : { typeId: this.typeId, name: draft.title.trim() }),
        enabled: draft.enabled,
        config,
      });
      if (!result.ok) return { status: "failed", error: result.error };
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
    return { status: "saved" };
  };
}
