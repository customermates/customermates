import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderContext, AutomationBuilderStore } from "./automation-builder.store";
import type { AutomationDraft } from "./automation-draft";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { reportApplicationError } from "@/core/errors/report-application-error";
import { COMPOSE_SENTENCE_MAX_CHARS } from "@/ee/automation-compose/compose-automation.schema";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { composeAutomationAction } from "../actions";
import { seedToDraft } from "./automation-draft";

export type AutomationComposeOutcome = "drafted" | "refused" | "failed" | "stale";

type Session = {
  context: AutomationBuilderContext;
  onSaved: (rule: AutomationRuleDto) => void;
  typeId?: string;
};

export class AutomationCreatePaletteStore {
  isOpen = false;
  query = "";
  composing = false;
  refusal: string | null = null;

  private session: Session | null = null;
  private generation = 0;

  constructor(private readonly builder: Pick<AutomationBuilderStore, "openForCreate">) {
    makeObservable<this, "session">(this, {
      session: observable.ref,
      isOpen: observable,
      query: observable,
      composing: observable,
      refusal: observable,
      open: action,
      close: action,
      setQuery: action,
      openDraft: action,
      openBlank: action,
      context: computed,
    });
  }

  get context(): AutomationBuilderContext | null {
    return this.session?.context ?? null;
  }

  open = (session: Session) => {
    this.generation += 1;
    this.session = session;
    this.query = "";
    this.composing = false;
    this.refusal = null;
    this.isOpen = true;
  };

  close = () => {
    this.generation += 1;
    this.isOpen = false;
    this.composing = false;
  };

  setQuery = (query: string) => {
    this.query = query.slice(0, COMPOSE_SENTENCE_MAX_CHARS);
    this.refusal = null;
  };

  openDraft = (draft: AutomationDraft, composed = false) => {
    const session = this.session;
    if (!session) return;
    this.close();
    this.builder.openForCreate(session.context, session.onSaved, { typeId: session.typeId, draft, composed });
  };

  openBlank = () => {
    const session = this.session;
    if (!session) return;
    this.close();
    this.builder.openForCreate(session.context, session.onSaved, { typeId: session.typeId });
  };

  compose = async (): Promise<AutomationComposeOutcome> => {
    const session = this.session;
    const sentence = this.query.trim();
    if (!session || !session.context.composer || !sentence || this.composing) return "failed";
    const generation = ++this.generation;
    runInAction(() => {
      this.composing = true;
      this.refusal = null;
    });
    try {
      const result = await composeAutomationAction({ sentence });
      if (generation !== this.generation || !this.isOpen) return "stale";
      if (!result.ok) {
        if (!notifyIfWorkspaceChanged(result.failure)) toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return "failed";
      }
      if (result.data.status === "refused") {
        const reason = result.data.reason;
        runInAction(() => {
          this.refusal = reason;
        });
        return "refused";
      }
      this.openDraft(seedToDraft(result.data.draft, session.context.model, session.context.timezone), true);
      return "drafted";
    } catch (error) {
      if (generation !== this.generation) return "stale";
      reportApplicationError(error);
      return "failed";
    } finally {
      if (generation === this.generation) {
        runInAction(() => {
          this.composing = false;
        });
      }
    }
  };
}
