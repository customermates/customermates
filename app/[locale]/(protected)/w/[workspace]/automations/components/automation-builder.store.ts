import type { RootStore } from "@/core/stores/root.store";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AutomationRuleDto, AutomationRulePreview } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftTrigger, DraftUnavailable } from "./automation-draft";
import type { WebhookOption } from "./automation-webhook-options";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { Action, Resource } from "@/generated/prisma";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import {
  AUTOMATION_CONDITION_LIMIT,
  AUTOMATION_EFFECT_LIMIT,
} from "@/features/automation-rules/automation-rule.schema";

import {
  composeAutomationAction,
  previewAutomationRuleAction,
  setAutomationRuleEnabledAction,
  upsertAutomationRuleAction,
} from "../actions";
import {
  blankCondition,
  blankEffect,
  conditionOperatorsFor,
  draftModelIssues,
  draftToPreviewInput,
  draftToUpsert,
  draftUnavailable,
  effectsForTrigger,
  emptyChainDraft,
  ruleToDraft,
  seedToDraft,
} from "./automation-draft";

export type AutomationBuilderContext = {
  model: AutomationBuilderModel;
  runtimes: AgentRuntimeAvailability;
  webhooks: WebhookOption[] | null;
  composer: boolean;
  cloud: boolean;
  timezone: string;
};

export type AutomationBuilderScreen = "start" | "chain";
export type AutomationBuilderPane = "preview" | "runs";
export type AutomationPaletteSlot = { index: number };
export type AutomationSaveOutcome = "saved" | "incomplete" | "unavailable" | "failed";

export function automationCardId(issue: string): string | null {
  if (issue === "trigger") return "trigger";
  const [group, position] = issue.split(".");
  if (position === undefined) return null;
  if (group === "effects") return `effect-${position}`;
  return group === "conditions" ? `condition-${position}` : null;
}
export type AutomationBuilderOpenOptions = { pane?: AutomationBuilderPane; typeId?: string; draft?: AutomationDraft };

function reindexIssues(issues: string[], group: "conditions" | "effects", at: number, shift: 1 | -1): string[] {
  return issues.flatMap((issue) => {
    const [head, position, ...rest] = issue.split(".");
    if (head !== group || position === undefined) return [issue];
    const index = Number(position);
    if (shift === -1 && index === at) return [];
    return [[head, String(index >= at ? index + shift : index), ...rest].join(".")];
  });
}

export const AUTOMATION_PREVIEW_DELAY_MS = 400;

const BLANK_TRIGGER: DraftTrigger = {
  kind: "recordCreated",
  typeId: "",
  fieldId: "",
  fieldIds: [],
  channel: "any",
  value: "",
  days: "1",
  direction: "before",
  atHour: "8",
  timezone: "UTC",
  kept: null,
};

const BLANK_DRAFT: AutomationDraft = {
  id: undefined,
  name: "",
  enabled: true,
  trigger: BLANK_TRIGGER,
  conditions: [],
  effects: [],
};

export class AutomationBuilderStore extends BaseModalStore<AutomationDraft> {
  context: AutomationBuilderContext | null = null;
  screen: AutomationBuilderScreen = "start";
  pane: AutomationBuilderPane = "preview";
  expanded: string | null = null;
  palette: AutomationPaletteSlot | null = null;
  invalid: string[] = [];
  preview: AutomationRulePreview | null = null;
  previewLoading = false;
  rule: AutomationRuleDto | null = null;
  composerText = "";
  composing = false;
  composedByMate = false;
  composerRefusal: string | null = null;
  onSaved: ((rule: AutomationRuleDto) => void) | null = null;

  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewGeneration = 0;
  private composeGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, BLANK_DRAFT, Resource.routines);

    makeObservable(this, {
      context: observable.ref,
      screen: observable,
      pane: observable,
      expanded: observable,
      palette: observable.ref,
      invalid: observable.ref,
      preview: observable.ref,
      previewLoading: observable,
      rule: observable.ref,
      composerText: observable,
      composing: observable,
      composedByMate: observable,
      composerRefusal: observable,
      unavailable: computed,
      isOwner: computed,
      isAdmin: computed,
      canPauseAsAdmin: computed,
      openForCreate: action,
      openForRule: action,
      applyDraft: action,
      startFromScratch: action,
      setPane: action,
      toggleCard: action,
      openPalette: action,
      closePalette: action,
      setName: action,
      setEnabled: action,
      patchTrigger: action,
      patchCondition: action,
      removeCondition: action,
      setEffect: action,
      removeEffect: action,
      addCondition: action,
      addEffect: action,
      setComposerText: action,
    });
  }

  get model(): AutomationBuilderModel | null {
    return this.context?.model ?? null;
  }

  get isExisting(): boolean {
    return Boolean(this.form.id);
  }

  get isOwner(): boolean {
    if (!this.form.id) return true;
    const ownerUserId = this.rule?.ownerUserId;
    return Boolean(ownerUserId && ownerUserId === this.rootStore.userStore.user?.id);
  }

  get isAdmin(): boolean {
    return Boolean(this.rootStore.userStore.user?.role?.isSystemRole);
  }

  get canManage(): boolean {
    return this.isOwner && super.canManage;
  }

  get isReadOnly(): boolean {
    return !this.canManage;
  }

  get canPauseAsAdmin(): boolean {
    return this.isExisting && !this.isOwner && this.isAdmin && this.form.enabled && this.allows(Action.update);
  }

  get canAddCondition(): boolean {
    return this.form.conditions.length < AUTOMATION_CONDITION_LIMIT;
  }

  get canAddEffect(): boolean {
    return this.form.effects.length < AUTOMATION_EFFECT_LIMIT;
  }

  get unavailable(): DraftUnavailable[] {
    const context = this.context;
    if (!context) return [];
    return draftUnavailable(this.form, {
      model: context.model,
      webhooks: context.webhooks,
      runtimes: context.runtimes,
    });
  }

  unavailableAt = (card: string): DraftUnavailable["what"] | undefined =>
    this.unavailable.find((entry) => entry.card === card)?.what;

  isFlagged = (key: string): boolean => this.invalid.some((issue) => issue === key || issue.startsWith(`${key}.`));

  private begin(
    context: AutomationBuilderContext,
    draft: AutomationDraft,
    screen: AutomationBuilderScreen,
    pane: AutomationBuilderPane,
    rule: AutomationRuleDto | null,
    onSaved: (rule: AutomationRuleDto) => void,
  ) {
    this.context = context;
    this.onSaved = onSaved;
    this.rule = rule;
    this.screen = screen;
    this.pane = pane;
    this.expanded = null;
    this.palette = null;
    this.invalid = [];
    this.preview = null;
    this.composerText = "";
    this.composerRefusal = null;
    this.composedByMate = false;
    this.composeGeneration += 1;
    this.composing = false;
    this.onInitOrRefresh({ ...BLANK_DRAFT, ...draft });
    this.open();
    this.schedulePreview(0);
  }

  openForCreate = (
    context: AutomationBuilderContext,
    onSaved: (rule: AutomationRuleDto) => void,
    options: AutomationBuilderOpenOptions = {},
  ) => {
    const prefilled = options.draft;
    this.begin(
      context,
      prefilled ?? emptyChainDraft(context.model, { typeId: options.typeId, timezone: context.timezone }),
      prefilled ? "chain" : "start",
      "preview",
      null,
      onSaved,
    );
  };

  openForRule = (
    context: AutomationBuilderContext,
    rule: AutomationRuleDto,
    onSaved: (rule: AutomationRuleDto) => void,
    options: AutomationBuilderOpenOptions = {},
  ) => {
    this.begin(
      context,
      ruleToDraft(rule, context.model, context.timezone),
      "chain",
      options.pane ?? "preview",
      rule,
      onSaved,
    );
  };

  applyDraft = (draft: AutomationDraft, composed = false) => {
    this.composeGeneration += 1;
    this.composing = false;
    this.form = { ...BLANK_DRAFT, ...draft };
    this.screen = "chain";
    this.composedByMate = composed;
    this.invalid = [];
    this.expanded = null;
    this.schedulePreview(0);
  };

  startFromScratch = () => {
    if (!this.context) return;
    this.applyDraft(
      emptyChainDraft(this.context.model, { timezone: this.context.timezone, typeId: this.form.trigger.typeId }),
    );
  };

  setPane = (pane: AutomationBuilderPane) => {
    this.pane = pane;
  };

  toggleCard = (id: string) => {
    this.expanded = this.expanded === id ? null : id;
  };

  openPalette = (slot: AutomationPaletteSlot) => {
    this.palette = slot;
  };

  closePalette = () => {
    this.palette = null;
  };

  setComposerText = (text: string) => {
    this.composerText = text;
  };

  setName = (name: string) => {
    this.form.name = name;
  };

  setEnabled = (enabled: boolean) => {
    this.form.enabled = enabled;
  };

  patchTrigger = (patch: Partial<DraftTrigger>) => {
    this.form.trigger = { ...this.form.trigger, ...patch };
    if (this.model) this.form.effects = effectsForTrigger(this.form.effects, this.form.trigger, this.model);
    this.schedulePreview();
  };

  patchCondition = (index: number, patch: Partial<DraftCondition>) => {
    this.form.conditions = this.form.conditions.map((condition, item) =>
      item === index ? { ...condition, ...patch } : condition,
    );
    this.schedulePreview();
  };

  addCondition = (at: number) => {
    const list = this.model?.lists.find((item) => item.id === this.form.trigger.typeId);
    if (!list || !this.canAddCondition) return;
    const next = [...this.form.conditions];
    const field = list.fields[0];
    next.splice(at, 0, blankCondition(field?.id ?? "", conditionOperatorsFor(field)[0]));
    this.form.conditions = next;
    this.invalid = reindexIssues(this.invalid, "conditions", at, 1);
    this.expanded = `condition-${at}`;
    this.palette = null;
    this.schedulePreview();
  };

  removeCondition = (index: number) => {
    this.form.conditions = this.form.conditions.filter((_, item) => item !== index);
    this.invalid = reindexIssues(this.invalid, "conditions", index, -1);
    this.expanded = null;
    this.schedulePreview();
  };

  setEffect = (index: number, effect: DraftEffect) => {
    this.form.effects = this.form.effects.map((current, item) => (item === index ? effect : current));
  };

  addEffect = (kind: string, at: number) => {
    if (!this.model || !this.canAddEffect) return;
    const next = [...this.form.effects];
    next.splice(at, 0, blankEffect(kind, this.model, this.form.trigger.typeId));
    this.form.effects = next;
    this.invalid = reindexIssues(this.invalid, "effects", at, 1).filter((issue) => issue !== "effects");
    this.expanded = `effect-${at}`;
    this.palette = null;
  };

  removeEffect = (index: number) => {
    this.form.effects = this.form.effects.filter((_, item) => item !== index);
    this.invalid = reindexIssues(this.invalid, "effects", index, -1);
    this.expanded = null;
  };

  private schedulePreview(delay = AUTOMATION_PREVIEW_DELAY_MS) {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.loadPreview(), delay);
  }

  loadPreview = async (): Promise<void> => {
    const model = this.model;
    if (!model || !this.isOpen) return;
    const generation = ++this.previewGeneration;
    const input = draftToPreviewInput(this.form, model);
    if (!input) {
      runInAction(() => {
        this.preview = null;
        this.previewLoading = false;
      });
      return;
    }
    runInAction(() => {
      this.previewLoading = true;
    });
    try {
      const data = await actionData(
        previewAutomationRuleAction({
          ...(this.form.id ? { id: this.form.id } : {}),
          rule: { trigger: input.trigger, conditions: input.conditions },
        }),
      );
      if (generation === this.previewGeneration) {
        runInAction(() => {
          this.preview = data;
        });
      }
    } catch (error) {
      if (generation === this.previewGeneration) {
        reportApplicationError(error);
        runInAction(() => {
          this.preview = null;
        });
      }
    } finally {
      if (generation === this.previewGeneration) {
        runInAction(() => {
          this.previewLoading = false;
        });
      }
    }
  };

  compose = async (): Promise<"drafted" | "refused" | "failed" | "stale"> => {
    const context = this.context;
    const sentence = this.composerText.trim();
    if (!context || !sentence || this.composing) return "failed";
    const generation = ++this.composeGeneration;
    runInAction(() => {
      this.composing = true;
      this.composerRefusal = null;
    });
    try {
      const result = await composeAutomationAction({ sentence });
      if (generation !== this.composeGeneration || !this.isOpen) return "stale";
      if (!result.ok) {
        if (!notifyIfWorkspaceChanged(result.failure)) toastZodErrorTree(serializedFailureErrorTree(result.failure));
        return "failed";
      }
      if (result.data.status === "refused") {
        runInAction(() => {
          this.composerRefusal = result.data.status === "refused" ? result.data.reason : null;
        });
        return "refused";
      }
      this.applyDraft(seedToDraft(result.data.draft, context.model, context.timezone), true);
      return "drafted";
    } catch (error) {
      if (generation !== this.composeGeneration) return "stale";
      reportApplicationError(error);
      return "failed";
    } finally {
      if (generation === this.composeGeneration) {
        runInAction(() => {
          this.composing = false;
        });
      }
    }
  };

  pauseAsAdmin = async (): Promise<boolean> => {
    const id = this.form.id;
    if (!id || !this.canPauseAsAdmin || this.isLoading) return false;
    runInAction(() => {
      this.isLoading = true;
    });
    try {
      const result = await setAutomationRuleEnabledAction({ id, enabled: false });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }
      const paused = result.data;
      runInAction(() => {
        this.rule = paused;
        this.onInitOrRefresh({ ...this.form, enabled: paused.enabled });
      });
      this.onSaved?.(paused);
      return true;
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  save = async (): Promise<AutomationSaveOutcome> => {
    const model = this.model;
    if (!model || this.isReadOnly) return "failed";
    const unavailable = this.unavailable;
    const converted = draftToUpsert(this.form, model);
    const unchosen = this.context ? draftModelIssues(this.form, this.context.runtimes) : [];
    if (unavailable.length > 0 || !converted.ok || unchosen.length > 0) {
      const issues = [
        ...unavailable.map((entry) => entry.card),
        ...(converted.ok ? [] : converted.issues),
        ...unchosen,
      ];
      runInAction(() => {
        this.invalid = [...new Set(issues)];
        const card = automationCardId(unavailable[0]?.card ?? issues[0] ?? "");
        if (card) this.expanded = card;
      });
      return unavailable.length > 0 ? "unavailable" : "incomplete";
    }
    runInAction(() => {
      this.invalid = [];
      this.isLoading = true;
    });
    try {
      const result = await upsertAutomationRuleAction(converted.input);
      if (!result.ok) {
        this.setError(result.error);
        return "failed";
      }
      const saved = result.data;
      runInAction(() => {
        this.onInitOrRefresh({ ...this.form, id: saved.id });
        this.rule = saved;
      });
      this.onSaved?.(saved);
      this.close();
      return "saved";
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  protected override prepareToClose(): boolean {
    clearTimeout(this.previewTimer);
    this.previewGeneration += 1;
    this.composeGeneration += 1;
    this.composing = false;
    return true;
  }
}
