import type { RootStore } from "@/core/stores/root.store";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AutomationPaletteKind } from "@/components/automations/automation-palette";
import type {
  AutomationRuleDto,
  AutomationRulePreview,
  AutomationRuleRunDto,
} from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftTrigger, DraftUnavailable } from "./automation-draft";
import type { WebhookOption } from "./automation-webhook-options";

import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";

import { Action, Resource } from "@/generated/prisma";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import {
  AUTOMATION_CONDITION_LIMIT,
  AUTOMATION_EFFECT_LIMIT,
} from "@/features/automation-rules/automation-rule.schema";

import {
  deleteAutomationRuleAction,
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
} from "./automation-draft";

export type AutomationBuilderContext = {
  model: AutomationBuilderModel;
  runtimes: AgentRuntimeAvailability;
  webhooks: WebhookOption[] | null;
  composer: boolean;
  cloud: boolean;
  timezone: string;
};

export type AutomationBuilderPane = "runs" | "settings";
export type AutomationPaletteSlot = { index: number };
export type AutomationSaveOutcome = "saved" | "incomplete" | "unavailable" | "failed";

export function automationCardId(issue: string): string | null {
  if (issue === "trigger") return "trigger";
  const [group, position] = issue.split(".");
  if (position === undefined) return null;
  if (group === "effects") return `effect-${position}`;
  return group === "conditions" ? `condition-${position}` : null;
}
export type AutomationBuilderOpenOptions = {
  pane?: AutomationBuilderPane;
  typeId?: string;
  draft?: AutomationDraft;
  composed?: boolean;
};

type StepRef = { group: "conditions" | "effects"; index: number };

function stepRef(id: string): StepRef | null {
  const [kind, position] = id.split("-");
  const index = Number(position);
  if (position === undefined || !Number.isInteger(index)) return null;
  if (kind === "condition") return { group: "conditions", index };
  return kind === "effect" ? { group: "effects", index } : null;
}

function stepId(ref: StepRef): string {
  return `${ref.group === "conditions" ? "condition" : "effect"}-${ref.index}`;
}

function swapIssues(issues: string[], group: "conditions" | "effects", from: number, to: number): string[] {
  return issues.map((issue) => {
    const [head, position, ...rest] = issue.split(".");
    if (head !== group || position === undefined) return issue;
    const index = Number(position);
    const swapped = index === from ? to : index === to ? from : index;
    return [head, String(swapped), ...rest].join(".");
  });
}

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
  change: "any",
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

export type AutomationReplacement = {
  replace: () => Promise<void>;
  reopen: () => void;
};

export class AutomationBuilderStore extends BaseModalStore<AutomationDraft> {
  context: AutomationBuilderContext | null = null;
  pane: AutomationBuilderPane = "runs";
  expanded: string | null = null;
  replay: AutomationRuleRunDto | null = null;
  palette: AutomationPaletteSlot | null = null;
  invalid: string[] = [];
  preview: AutomationRulePreview | null = null;
  previewLoading = false;
  rule: AutomationRuleDto | null = null;
  composedByMate = false;
  onSaved: ((rule: AutomationRuleDto) => void) | null = null;
  onSwitchToSchedule: ((draft: AutomationDraft, replacement?: AutomationReplacement) => void) | null = null;

  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewGeneration = 0;
  private openGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, BLANK_DRAFT, Resource.routines);

    makeObservable(this, {
      context: observable.ref,
      pane: observable,
      expanded: observable,
      onSwitchToSchedule: observable.ref,
      replay: observable.ref,
      palette: observable.ref,
      invalid: observable.ref,
      preview: observable.ref,
      previewLoading: observable,
      rule: observable.ref,
      composedByMate: observable,
      unavailable: computed,
      isOwner: computed,
      isAdmin: computed,
      canPauseAsAdmin: computed,
      canDelete: computed,
      canDuplicate: computed,
      openForCreate: action,
      openForRule: action,
      applyDraft: action,
      setPane: action,
      select: action,
      insertStep: action,
      moveStep: action,
      duplicateStep: action,
      removeStep: action,
      showRun: action,
      closeRun: action,
      openPalette: action,
      closePalette: action,
      setName: action,
      setEnabled: action,
      patchTrigger: action,
      setScheduleHandoff: action,
      resetChanges: action,
      offersSchedule: computed,
      hasStepsBesidesMate: computed,
      canSwitchToSchedule: computed,
      patchCondition: action,
      removeCondition: action,
      setEffect: action,
      removeEffect: action,
      addCondition: action,
      addEffect: action,
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

  get canOpenAgentSettings(): boolean {
    const { userStore } = this.rootStore;
    return userStore.can(Resource.company, Action.readOwn) || userStore.can(Resource.company, Action.readAll);
  }

  get canDelete(): boolean {
    return (
      this.isExisting &&
      this.rootStore.userStore.can(Resource.routines, Action.delete) &&
      (this.isAdmin || this.isOwner)
    );
  }

  get canDuplicate(): boolean {
    return this.isExisting && this.allows(Action.create);
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
      viewerIsOwner: this.isOwner,
    });
  }

  unavailableAt = (card: string): DraftUnavailable["what"] | undefined =>
    this.unavailable.find((entry) => entry.card === card)?.what;

  isFlagged = (key: string): boolean => this.invalid.some((issue) => issue === key || issue.startsWith(`${key}.`));

  private begin(
    context: AutomationBuilderContext,
    draft: AutomationDraft,
    pane: AutomationBuilderPane,
    rule: AutomationRuleDto | null,
    onSaved: (rule: AutomationRuleDto) => void,
    composed = false,
  ) {
    this.openGeneration += 1;
    this.context = context;
    this.onSaved = onSaved;
    this.rule = rule;
    this.pane = pane;
    this.expanded = null;
    this.replay = null;
    this.palette = null;
    this.invalid = [];
    this.preview = null;
    this.composedByMate = composed;
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
      "settings",
      null,
      onSaved,
      Boolean(prefilled && options.composed),
    );
    if (!prefilled) this.markBlank();
  };

  openForRule = (
    context: AutomationBuilderContext,
    rule: AutomationRuleDto,
    onSaved: (rule: AutomationRuleDto) => void,
    options: AutomationBuilderOpenOptions = {},
  ) => {
    this.begin(context, ruleToDraft(rule, context.model, context.timezone), options.pane ?? "runs", rule, onSaved);
  };

  applyDraft = (draft: AutomationDraft, composed = false) => {
    this.form = { ...BLANK_DRAFT, ...draft };
    this.composedByMate = composed;
    this.invalid = [];
    this.expanded = null;
    this.replay = null;
    this.schedulePreview(0);
  };

  private markBlank() {
    this.expanded = "trigger";
  }

  setScheduleHandoff = (handoff: ((draft: AutomationDraft, replacement?: AutomationReplacement) => void) | null) => {
    this.onSwitchToSchedule = handoff;
  };

  get offersSchedule(): boolean {
    return this.onSwitchToSchedule !== null && !this.isReadOnly && (this.rule === null || this.canDelete);
  }

  resetChanges = () => {
    this.resetForm();
    this.invalid = [];
    this.expanded = null;
    this.palette = null;
    this.schedulePreview(0);
  };

  get hasStepsBesidesMate(): boolean {
    return (
      this.form.conditions.length > 0 ||
      this.form.effects.some((effect) => (effect.kind === "kept" ? effect.effect.kind : effect.kind) !== "agent")
    );
  }

  get canSwitchToSchedule(): boolean {
    return this.offersSchedule && !this.hasStepsBesidesMate;
  }

  switchToSchedule = () => {
    const handoff = this.onSwitchToSchedule;
    if (!handoff || !this.canSwitchToSchedule) return;
    const draft = toJS(this.form);
    const { rule, context, onSaved } = this;
    this.close();
    if (!rule || !context || !onSaved) {
      handoff(draft);
      return;
    }
    handoff(draft, {
      replace: () => this.deleteRuleById(rule.id),
      reopen: () => {
        this.openForRule(context, rule, onSaved, { pane: "settings" });
        this.applyDraft(draft);
      },
    });
  };

  private deleteRuleById = async (id: string): Promise<void> => {
    const result = await deleteAutomationRuleAction({ id });
    if (!result.ok) toastZodErrorTree(result.error);
    await this.rootStore.automationsStore.refresh();
  };

  setPane = (pane: AutomationBuilderPane) => {
    this.pane = pane;
  };

  select = (id: string | null) => {
    this.expanded = id;
    this.palette = null;
    if (id) this.replay = null;
  };

  showRun = (run: AutomationRuleRunDto) => {
    this.replay = run;
    this.expanded = null;
    this.palette = null;
  };

  closeRun = () => {
    this.replay = null;
  };

  openPalette = (slot: AutomationPaletteSlot) => {
    this.palette = slot;
    this.replay = null;
  };

  closePalette = () => {
    this.palette = null;
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

  insertStep = (position: number, kind: AutomationPaletteKind) => {
    const conditionCount = this.form.conditions.length;
    if (kind === "condition") this.addCondition(Math.min(Math.max(0, position - 1), conditionCount));
    else this.addEffect(kind, Math.max(0, position - 1 - conditionCount));
  };

  moveStep = (id: string, delta: -1 | 1) => {
    const ref = stepRef(id);
    if (!ref) return;
    const list: unknown[] = ref.group === "conditions" ? [...this.form.conditions] : [...this.form.effects];
    const to = ref.index + delta;
    if (to < 0 || to >= list.length) return;
    [list[ref.index], list[to]] = [list[to], list[ref.index]];
    if (ref.group === "conditions") this.form.conditions = list as DraftCondition[];
    else this.form.effects = list as DraftEffect[];
    this.invalid = swapIssues(this.invalid, ref.group, ref.index, to);
    this.expanded = stepId({ group: ref.group, index: to });
    if (ref.group === "conditions") this.schedulePreview();
  };

  duplicateStep = (id: string) => {
    const ref = stepRef(id);
    if (!ref) return;
    const at = ref.index + 1;
    if (ref.group === "conditions") {
      const source = this.form.conditions[ref.index];
      if (!source || !this.canAddCondition) return;
      const next = [...this.form.conditions];
      next.splice(at, 0, toJS(source));
      this.form.conditions = next;
      this.schedulePreview();
    } else {
      const source = this.form.effects[ref.index];
      if (!source || !this.canAddEffect) return;
      const next = [...this.form.effects];
      next.splice(at, 0, toJS(source));
      this.form.effects = next;
    }
    this.invalid = reindexIssues(this.invalid, ref.group, at, 1);
    this.expanded = stepId({ group: ref.group, index: at });
  };

  removeStep = (id: string) => {
    const ref = stepRef(id);
    if (!ref) return;
    if (ref.group === "conditions") this.removeCondition(ref.index);
    else this.removeEffect(ref.index);
  };

  duplicateRule = (name: string) => {
    const context = this.context;
    const onSaved = this.onSaved;
    if (!context || !onSaved || !this.canDuplicate) return;
    const copy = toJS(this.form);
    this.begin(context, { ...copy, id: undefined, name }, "settings", null, onSaved);
  };

  deleteRule = async (): Promise<boolean> => {
    const id = this.form.id;
    if (!id || !this.canDelete) return false;
    const result = await deleteAutomationRuleAction({ id });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return false;
    }
    this.close();
    await this.rootStore.automationsStore.refresh();
    return true;
  };

  private schedulePreview(delay = AUTOMATION_PREVIEW_DELAY_MS) {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.loadPreview(), delay);
  }

  loadPreview = async (): Promise<void> => {
    const model = this.model;
    if (!model || !this.isOpen) return;
    const generation = ++this.previewGeneration;
    const input = draftToPreviewInput(toJS(this.form), model);
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

  pauseAsAdmin = async (): Promise<boolean> => {
    const id = this.form.id;
    if (!id || !this.canPauseAsAdmin || this.isLoading) return false;
    const generation = this.openGeneration;
    const onSaved = this.onSaved;
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
      if (generation === this.openGeneration) {
        runInAction(() => {
          this.rule = paused;
          this.onInitOrRefresh({ ...this.form, enabled: paused.enabled });
        });
      }
      onSaved?.(paused);
      return true;
    } finally {
      if (generation === this.openGeneration) {
        runInAction(() => {
          this.isLoading = false;
        });
      }
    }
  };

  save = async (): Promise<AutomationSaveOutcome> => {
    const model = this.model;
    if (!model || this.isReadOnly) return "failed";
    const unavailable = this.unavailable;
    const converted = draftToUpsert(toJS(this.form), model);
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
        else if (issues.includes("name")) {
          this.expanded = null;
          this.pane = "settings";
        }
      });
      return unavailable.length > 0 ? "unavailable" : "incomplete";
    }
    const generation = this.openGeneration;
    const onSaved = this.onSaved;
    runInAction(() => {
      this.invalid = [];
      this.isLoading = true;
    });
    try {
      const result = await upsertAutomationRuleAction(converted.input);
      const current = generation === this.openGeneration;
      if (!result.ok) {
        if (current) this.setError(result.error);
        else toastZodErrorTree(result.error);
        return "failed";
      }
      const saved = result.data;
      if (current) {
        runInAction(() => {
          this.onInitOrRefresh({ ...this.form, id: saved.id });
          this.rule = saved;
        });
      }
      onSaved?.(saved);
      if (current) this.close();
      return "saved";
    } finally {
      if (generation === this.openGeneration) {
        runInAction(() => {
          this.isLoading = false;
        });
      }
    }
  };

  protected override prepareToClose(): boolean {
    this.openGeneration += 1;
    clearTimeout(this.previewTimer);
    this.previewGeneration += 1;
    return true;
  }
}
