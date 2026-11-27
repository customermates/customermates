import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  adjustWorkspaceSetupAction: vi.fn(),
  confirmWorkspaceSetupAction: vi.fn(),
  getWorkspaceSetupStatusAction: vi.fn(),
  planWorkspaceSetupAction: vi.fn(),
  retryWorkspaceSetupPhaseAction: vi.fn(),
  saveWorkspaceSetupAnswersAction: vi.fn(),
  startWorkspaceSetupAction: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../../workspace-setup-actions", () => actions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: toast }));
const workspaceNotice = vi.hoisted(() => ({ notifyWorkspaceChanged: vi.fn() }));
vi.mock("@/core/errors/workspace-changed-notice", async () => {
  const { isWorkspaceChangedError, isWorkspaceChangedFailure } = await import("@/core/errors/workspace-changed");
  return {
    notifyWorkspaceChanged: workspaceNotice.notifyWorkspaceChanged,
    notifyIfWorkspaceChanged: (value: unknown) => {
      const changed = isWorkspaceChangedFailure(value) || isWorkspaceChangedError(value);
      if (changed) workspaceNotice.notifyWorkspaceChanged();
      return changed;
    },
  };
});

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { PLAN_PROGRESS, SETUP_ID, setupPlan, setupView } from "./setup-view-fixture";

const MESSAGE = "Must not be blank.";
const confirmed = { source: "user" as const, confidence: 1 };

function storeWith(view = setupView()) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as RootStore);
  store.hydrate({ available: true, setup: view });
  return store;
}

function plannedView(overrides: Parameters<typeof setupView>[0] = {}) {
  return setupView({
    status: "planned",
    plan: { status: "completed", error: null, revision: 1, plan: setupPlan(), ...PLAN_PROGRESS },
    ...overrides,
  });
}

function answerAll(store: WorkspaceSetupStore) {
  store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
  store.setAnswer("purpose", { format: "multipleChoice", values: ["projects"], custom: [] });
  store.setAnswer("pricing", { format: "singleChoice", value: "timeBased" });
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveWorkspaceSetupAnswersAction.mockResolvedValue({ ok: true, data: { answers: {} } });
  actions.planWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { planRevision: 1 } });
  actions.adjustWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { planRevision: 2 } });
  actions.getWorkspaceSetupStatusAction.mockResolvedValue({ ok: true, data: { available: true, setup: setupView() } });
});

describe("WorkspaceSetupStore questions", () => {
  it("shows only the questions the answers so far make visible", () => {
    const store = storeWith();
    expect(store.questions.map((question) => question.id)).toEqual(["workWith", "purpose", "charge"]);

    store.setAnswer("purpose", { format: "multipleChoice", values: ["deals"], custom: [] });
    expect(store.questions.map((question) => question.id)).toEqual(["workWith", "purpose", "mainSteps", "charge"]);
    expect(store.currentQuestion.id).toBe("workWith");
    expect(store.questionNumber).toBe(1);
  });

  it("keeps the owner on a question until it is answered", () => {
    const store = storeWith();

    expect(store.nextQuestion(MESSAGE)).toBe(false);
    expect(toast).toHaveBeenCalledWith({ errors: [MESSAGE] });
    expect(store.answerMissing("workWith")).toBe(true);
    expect(store.questionNumber).toBe(1);

    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
    expect(store.nextQuestion(MESSAGE)).toBe(false);
    expect(store.currentQuestion.id).toBe("purpose");
    expect(store.answerMissing("workWith")).toBe(false);
  });

  it("stores the suggested steps when the owner moves on without editing them", () => {
    const store = storeWith();
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
    store.nextQuestion(MESSAGE);
    store.setAnswer("purpose", { format: "multipleChoice", values: ["deals"], custom: [] });
    store.nextQuestion(MESSAGE);
    expect(store.currentQuestion.id).toBe("mainSteps");
    expect(store.stepSuggestion).toBe("dealsClients");

    store.nextQuestion(MESSAGE, ["Inquiry", "Won"]);

    expect(store.answers.mainSteps?.value).toEqual({
      format: "orderedList",
      items: [{ label: "Inquiry" }, { label: "Won" }],
    });
    expect(store.stepSuggestion).toBeNull();
    expect(store.currentQuestion.id).toBe("charge");
  });

  it("reports the last question as done and goes back one question at a time", () => {
    const store = storeWith();
    answerAll(store);
    store.setAnswer("purpose", { format: "multipleChoice", values: ["finances"], custom: [] });
    store.nextQuestion(MESSAGE);
    store.nextQuestion(MESSAGE);
    expect(store.isLastQuestion).toBe(true);
    expect(store.nextQuestion(MESSAGE)).toBe(true);

    expect(store.previousQuestion()).toBe(true);
    expect(store.currentQuestion.id).toBe("purpose");
    store.previousQuestion();
    expect(store.previousQuestion()).toBe(false);
    expect(store.currentQuestion.id).toBe("workWith");
  });

  it("saves only the asked answers with the preselected example records and asks for the plan", async () => {
    const store = storeWith(
      setupView({
        interview: {
          ...setupView().interview,
          answers: { companyName: { ...confirmed, value: { format: "shortText", value: "Acme" } } },
        },
      }),
    );
    answerAll(store);

    await store.showPlan();

    const saved = actions.saveWorkspaceSetupAnswersAction.mock.calls[0][0] as { answers: Record<string, unknown> };
    expect(saved.answers).toEqual({
      workWith: { format: "singleChoice", value: "clients" },
      purpose: { format: "multipleChoice", values: ["projects"], custom: [] },
      pricing: { format: "singleChoice", value: "timeBased" },
      existingData: { format: "singleChoice", value: "sampleData" },
    });
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
    expect(actions.getWorkspaceSetupStatusAction).toHaveBeenCalled();
  });

  it("asks for nothing while an answer is still missing", async () => {
    const store = storeWith();
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });

    expect(await store.showPlan()).toBe(false);

    expect(actions.saveWorkspaceSetupAnswersAction).not.toHaveBeenCalled();
  });

  it("changes an answer only from a drafted or failed plan and re-plans with the adjustment", async () => {
    const drafting = storeWith(setupView({ status: "planning" }));
    expect(drafting.canChangeAnswers).toBe(false);
    drafting.changeAnswer("purpose");
    expect(drafting.adjusting).toBe(false);

    const store = storeWith(plannedView());
    answerAll(store);
    expect(store.stage).toBe("plan");
    store.changeAnswer("charge");
    expect(store.stage).toBe("interview");
    expect(store.currentQuestion.id).toBe("charge");
    store.setAnswer("existingData", { format: "singleChoice", value: "empty" });

    await store.showPlan();

    expect(actions.saveWorkspaceSetupAnswersAction).not.toHaveBeenCalled();
    expect(actions.adjustWorkspaceSetupAction).toHaveBeenCalledWith({
      setupId: SETUP_ID,
      answers: expect.objectContaining({ existingData: { format: "singleChoice", value: "empty" } }),
      followUpAnswers: [],
    });
    expect(store.adjusting).toBe(false);
  });

  it("drops a change when the owner backs out to the plan", () => {
    const store = storeWith(
      plannedView({
        interview: {
          ...setupView().interview,
          answers: { workWith: { ...confirmed, value: { format: "singleChoice", value: "clients" } } },
        },
      }),
    );

    store.changeAnswer("workWith");
    store.setAnswer("workWith", { format: "singleChoice", value: "ownWork" });
    store.discardAdjustment();

    expect(store.stage).toBe("plan");
    expect(store.answers.workWith?.value).toEqual({ format: "singleChoice", value: "clients" });
  });

  it("saves and re-plans the answers of a failed plan", async () => {
    const store = storeWith(
      setupView({ plan: { status: "failed", error: "invalidPlan", revision: 2, plan: null, ...PLAN_PROGRESS } }),
    );
    expect(store.stage).toBe("planFailed");
    answerAll(store);
    store.changeAnswer("purpose");
    expect(store.stage).toBe("interview");

    await store.showPlan();

    expect(actions.adjustWorkspaceSetupAction).not.toHaveBeenCalled();
    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalled();
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
  });

  it("starts the setup with the locale only", async () => {
    actions.startWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { setupId: SETUP_ID } });
    const store = new WorkspaceSetupStore({ localeStore: { locale: "de" } } as RootStore);
    store.hydrate({ available: true, setup: null });
    expect(store.stage).toBe("start");

    await store.start();

    expect(actions.startWorkspaceSetupAction).toHaveBeenCalledExactlyOnceWith({ locale: "de" });
  });
});

describe("WorkspaceSetupStore commands", () => {
  it("confirms the build with the previewed plan revision", async () => {
    actions.confirmWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { setupId: SETUP_ID } });
    const store = storeWith(
      setupView({
        status: "planned",
        plan: { status: "completed", error: null, revision: 3, plan: setupPlan(), ...PLAN_PROGRESS },
      }),
    );

    await store.build();

    expect(actions.confirmWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID, planRevision: 3 });
  });

  it("builds nothing before a plan exists", async () => {
    const store = storeWith(setupView({ status: "planning" }));

    expect(await store.build()).toBe(false);
    expect(actions.confirmWorkspaceSetupAction).not.toHaveBeenCalled();
  });

  it("toasts a refused command and reloads the setup to show where it stands", async () => {
    actions.retryWorkspaceSetupPhaseAction.mockResolvedValue({
      ok: false,
      failure: { kind: "conflict", issues: [{ code: "custom", path: [], message: "busy" }] },
    });
    actions.getWorkspaceSetupStatusAction.mockResolvedValue({
      ok: true,
      data: { available: true, setup: setupView({ status: "building" }) },
    });
    const store = storeWith(setupView({ status: "failed" }));

    expect(await store.retryPhase("records")).toBe(false);
    expect(actions.retryWorkspaceSetupPhaseAction).toHaveBeenCalledWith({ setupId: SETUP_ID, phase: "records" });
    expect(toast).toHaveBeenCalledOnce();
    expect(store.pending).toBeNull();
    expect(store.setup?.status).toBe("building");
  });

  it("shows the questions again when the plan to build was withdrawn in the meantime", async () => {
    actions.confirmWorkspaceSetupAction.mockResolvedValue({
      ok: false,
      failure: { kind: "conflict", issues: [{ code: "custom", path: [], message: "changed" }] },
    });
    actions.getWorkspaceSetupStatusAction.mockResolvedValue({
      ok: true,
      data: { available: true, setup: plannedView({ status: "interview" }) },
    });
    const store = storeWith(plannedView());

    expect(await store.build()).toBe(false);
    expect(store.stage).toBe("interview");
  });

  it("polls only while something runs on the server", () => {
    expect(storeWith(setupView({ status: "planning" })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "building" })).shouldPoll).toBe(true);
    expect(
      storeWith(setupView({ plan: { status: "queued", error: null, revision: 1, plan: null, ...PLAN_PROGRESS } }))
        .shouldPoll,
    ).toBe(true);
    expect(storeWith(setupView({ status: "completed" })).shouldPoll).toBe(false);
    expect(storeWith(setupView()).shouldPoll).toBe(false);
  });

  it("keeps an answer the owner touched while the server answers change", () => {
    const store = storeWith();
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });

    store.hydrate({
      available: true,
      setup: setupView({
        interview: {
          ...setupView().interview,
          answers: {
            workWith: { ...confirmed, value: { format: "singleChoice", value: "customers" } },
            teamSize: { ...confirmed, value: { format: "singleChoice", value: "small" } },
          },
        },
      }),
    });

    expect(store.answers.workWith?.value).toEqual({ format: "singleChoice", value: "clients" });
    expect(store.answers.teamSize?.value).toEqual({ format: "singleChoice", value: "small" });
  });

  it("loads the confirmed answers and resets when a new setup appears", () => {
    const store = storeWith(
      setupView({
        interview: {
          ...setupView().interview,
          answers: { companyName: { ...confirmed, value: { format: "shortText", value: "Acme" } } },
        },
      }),
    );
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
    store.nextQuestion(MESSAGE);
    expect(store.answers.companyName?.value).toEqual({ format: "shortText", value: "Acme" });

    store.hydrate({ available: true, setup: setupView({ id: "0a7a2d6e-0c4f-4b8e-9f43-8f0f3b1f0b11" }) });
    expect(store.answers).toEqual({});
    expect(store.questionNumber).toBe(1);
  });

  it("drops a background poll that answers after the owner started a command", async () => {
    let answerPoll: (value: unknown) => void = () => undefined;
    actions.getWorkspaceSetupStatusAction.mockImplementationOnce(
      () => new Promise((resolve) => (answerPoll = resolve)),
    );
    actions.confirmWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { setupId: SETUP_ID } });
    actions.getWorkspaceSetupStatusAction.mockResolvedValueOnce({
      ok: true,
      data: { available: true, setup: plannedView({ status: "building" }) },
    });
    const store = storeWith(plannedView());

    const poll = store.poll();
    await store.build();
    answerPoll({ ok: true, data: { available: true, setup: plannedView() } });

    await expect(poll).resolves.toBe(false);
    expect(store.setup?.status).toBe("building");
  });

  it("skips a background poll while a command runs", async () => {
    let finishBuild: (value: unknown) => void = () => undefined;
    actions.confirmWorkspaceSetupAction.mockImplementationOnce(() => new Promise((resolve) => (finishBuild = resolve)));
    const store = storeWith(plannedView());

    const build = store.build();
    await expect(store.poll()).resolves.toBe(false);
    expect(actions.getWorkspaceSetupStatusAction).not.toHaveBeenCalled();

    finishBuild({ ok: false, failure: { kind: "validation", issues: [] } });
    await build;
  });

  it("stops instead of showing another workspace's setup after another tab switched the workspace", async () => {
    const store = storeWith();
    actions.getWorkspaceSetupStatusAction.mockResolvedValue({
      ok: true,
      data: { available: true, setup: setupView({ id: "11111111-2222-4333-8444-555555555555" }) },
    });

    await expect(store.refresh()).resolves.toBe(false);

    expect(workspaceNotice.notifyWorkspaceChanged).toHaveBeenCalledOnce();
    expect(store.setup?.id).toBe(SETUP_ID);
  });

  it("stops when the server reports that the workspace changed", async () => {
    const store = storeWith();
    actions.getWorkspaceSetupStatusAction.mockResolvedValue({
      ok: false,
      failure: { kind: "conflict", issues: [{ customCode: "workspaceChanged" }] },
    });

    await expect(store.refresh()).resolves.toBe(false);

    expect(workspaceNotice.notifyWorkspaceChanged).toHaveBeenCalledOnce();
  });
});
