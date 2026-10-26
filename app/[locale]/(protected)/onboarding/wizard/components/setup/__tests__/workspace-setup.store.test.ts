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
  uploadWorkspaceSetupSpreadsheetAction: vi.fn(),
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

const website = { source: "website" as const, confidence: 0.9 };

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

function answerWorkspaceScreen(store: WorkspaceSetupStore, companyName: string) {
  store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
  store.setAnswer("purpose", { format: "multipleChoice", values: ["projects"], custom: [] });
  store.setAnswer("existingData", { format: "singleChoice", value: "sampleData" });
  store.setAnswer("companyName", { format: "shortText", value: companyName });
  store.setAnswer("country", { format: "singleChoice", value: "DE" });
  store.setAnswer("currency", { format: "singleChoice", value: "EUR" });
  store.setAnswer("teamSize", { format: "singleChoice", value: "solo" });
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveWorkspaceSetupAnswersAction.mockResolvedValue({ ok: true, data: { answers: {} } });
  actions.planWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { planRevision: 1 } });
  actions.adjustWorkspaceSetupAction.mockResolvedValue({ ok: true, data: { planRevision: 2 } });
  actions.getWorkspaceSetupStatusAction.mockResolvedValue({ ok: true, data: { available: true, setup: setupView() } });
});

describe("WorkspaceSetupStore", () => {
  it("keeps an answer the owner touched when a website pre-fill lands on the same screen", () => {
    const store = storeWith();
    store.setAnswer("companyName", { format: "shortText", value: "Acme GmbH" });

    store.hydrate({
      available: true,
      setup: setupView({
        interview: {
          ...setupView().interview,
          answers: {
            companyName: { ...website, value: { format: "shortText", value: "ACME Holding" } },
            teamSize: { ...website, value: { format: "singleChoice", value: "small" } },
          },
        },
      }),
    });

    expect(store.answers.companyName?.value).toEqual({ format: "shortText", value: "Acme GmbH" });
    expect(store.answers.teamSize?.value).toEqual({ format: "singleChoice", value: "small" });
  });

  it("saves the answers with the default language and asks for the plan", async () => {
    const store = storeWith();
    answerWorkspaceScreen(store, "Acme");
    expect(store.canConfirmScreen).toBe(true);

    await store.confirmScreen();

    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalledWith(
      expect.objectContaining({
        setupId: SETUP_ID,
        answers: expect.objectContaining({ language: { format: "singleChoice", value: "en" } }),
      }),
    );
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
    expect(actions.getWorkspaceSetupStatusAction).toHaveBeenCalled();
  });

  it("shows the missing answers with a toast when the plan is asked for too early", () => {
    const store = storeWith();
    store.setAnswer("purpose", { format: "multipleChoice", values: ["projects"], custom: [] });
    expect(store.answerMissing("workWith")).toBe(false);

    expect(store.showMissingAnswers("Must not be blank.")).toBe(true);

    expect(toast).toHaveBeenCalledWith({ errors: ["Must not be blank."] });
    expect(store.missingAnswers).toEqual(["workWith", "existingData"]);
    expect(store.answerMissing("workWith")).toBe(true);
    expect(store.answerMissing("purpose")).toBe(false);
    expect(store.answerMissing("currency")).toBe(false);
    store.setAnswer("workWith", { format: "singleChoice", value: "customers" });
    expect(store.answerMissing("workWith")).toBe(false);

    answerWorkspaceScreen(store, "Acme");
    expect(store.showMissingAnswers("Must not be blank.")).toBe(false);
    expect(toast).toHaveBeenCalledOnce();
  });

  it("waits for a chosen spreadsheet to be uploaded", () => {
    const store = storeWith();
    answerWorkspaceScreen(store, "Acme");
    store.setAnswer("existingData", { format: "singleChoice", value: "spreadsheet" });
    expect(store.canConfirmScreen).toBe(false);
    store.showMissingAnswers("Must not be blank.");
    expect(store.answerMissing("existingData")).toBe(true);

    store.hydrate({ available: true, setup: setupView({ spreadsheet: { fileName: "contacts.csv" } }) });
    expect(store.canConfirmScreen).toBe(true);
  });

  it("suggests the steps of the tracked work without saving them as an answer until the owner edits them", async () => {
    const store = storeWith();
    expect(store.stepSuggestion).toBeNull();
    answerWorkspaceScreen(store, "Acme");
    expect(store.stepSuggestion).toBe("projects");
    store.setAnswer("purpose", { format: "multipleChoice", values: ["deals"], custom: [] });
    expect(store.stepSuggestion).toBe("dealsClients");
    expect(store.answers.mainSteps).toBeUndefined();

    await store.confirmScreen();
    const saved = actions.saveWorkspaceSetupAnswersAction.mock.calls[0][0] as { answers: Record<string, unknown> };
    expect(saved.answers).not.toHaveProperty("mainSteps");

    store.setAnswer("mainSteps", { format: "orderedList", items: [{ label: "Mine" }] });
    expect(store.stepSuggestion).toBeNull();
    expect(store.answers.mainSteps?.source).toBe("user");
  });

  it("keeps steps from the website or confirmed earlier instead of suggesting others", () => {
    const steps = { format: "orderedList" as const, items: [{ label: "From before" }] };
    const purpose = {
      source: "user" as const,
      confidence: 1,
      value: { format: "multipleChoice" as const, values: ["projects"], custom: [] },
    };
    const confirmed = storeWith(
      setupView({
        interview: {
          ...setupView().interview,
          answers: { purpose, mainSteps: { source: "user", confidence: 1, value: steps } },
        },
      }),
    );
    expect(confirmed.stepSuggestion).toBeNull();
    expect(confirmed.answers.mainSteps?.value).toEqual(steps);

    const prefilled = storeWith(
      setupView({
        interview: { ...setupView().interview, answers: { purpose, mainSteps: { ...website, value: steps } } },
      }),
    );
    expect(prefilled.stepSuggestion).toBeNull();
    expect(prefilled.answers.mainSteps?.value).toEqual(steps);
  });

  it("re-plans an adjusted plan with every answer", async () => {
    const store = storeWith(plannedView());
    expect(store.stage).toBe("plan");

    store.adjust();
    expect(store.stage).toBe("interview");
    answerWorkspaceScreen(store, "Acme Studio");
    store.setAnswer("existingData", { format: "singleChoice", value: "empty" });
    await store.confirmScreen();

    expect(actions.saveWorkspaceSetupAnswersAction).not.toHaveBeenCalled();
    expect(actions.adjustWorkspaceSetupAction).toHaveBeenCalledWith({
      setupId: SETUP_ID,
      answers: expect.objectContaining({
        companyName: { format: "shortText", value: "Acme Studio" },
        existingData: { format: "singleChoice", value: "empty" },
      }),
      followUpAnswers: [],
    });
    expect(actions.planWorkspaceSetupAction).not.toHaveBeenCalled();
    expect(store.adjusting).toBe(false);
  });

  it("drops Adjust changes when the owner backs out to the plan", () => {
    const confirmed = { source: "user" as const, confidence: 1 };
    const store = storeWith(
      plannedView({
        interview: {
          ...setupView().interview,
          answers: { companyName: { ...confirmed, value: { format: "shortText", value: "Acme" } } },
        },
      }),
    );

    store.adjust();
    answerWorkspaceScreen(store, "Renamed Ltd");
    store.discardAdjustment();

    expect(store.stage).toBe("plan");
    expect(store.answers.companyName?.value).toEqual({ format: "shortText", value: "Acme" });
    expect(actions.saveWorkspaceSetupAnswersAction).not.toHaveBeenCalled();
    store.adjust();
    expect(store.answers.companyName?.value).toEqual({ format: "shortText", value: "Acme" });
  });

  it("saves and re-plans once a new spreadsheet has withdrawn the plan being adjusted", async () => {
    const store = storeWith(plannedView());
    store.adjust();
    answerWorkspaceScreen(store, "Acme");
    store.setAnswer("existingData", { format: "singleChoice", value: "spreadsheet" });
    store.hydrate({
      available: true,
      setup: plannedView({ status: "interview", spreadsheet: { fileName: "clients.csv" } }),
    });
    expect(store.stage).toBe("interview");

    await store.confirmScreen();

    expect(actions.adjustWorkspaceSetupAction).not.toHaveBeenCalled();
    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: expect.objectContaining({ existingData: { format: "singleChoice", value: "spreadsheet" } }),
      }),
    );
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
  });

  it("reopens the questions of a failed plan and drafts a new plan from the changed answers", async () => {
    const store = storeWith(
      setupView({ plan: { status: "failed", error: "invalidPlan", revision: 2, plan: null, ...PLAN_PROGRESS } }),
    );
    expect(store.stage).toBe("planFailed");

    store.adjust();
    expect(store.stage).toBe("interview");
    store.discardAdjustment();
    expect(store.stage).toBe("planFailed");

    store.adjust();
    answerWorkspaceScreen(store, "Acme");
    store.setAnswer("existingData", { format: "singleChoice", value: "empty" });
    await store.confirmScreen();

    expect(actions.adjustWorkspaceSetupAction).not.toHaveBeenCalled();
    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalledWith(
      expect.objectContaining({
        setupId: SETUP_ID,
        answers: expect.objectContaining({ existingData: { format: "singleChoice", value: "empty" } }),
      }),
    );
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
    expect(store.adjusting).toBe(false);
  });

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

  it("names why a spreadsheet was refused and clears the reason once a file is accepted", async () => {
    actions.uploadWorkspaceSetupSpreadsheetAction.mockResolvedValueOnce({
      ok: true,
      data: { accepted: false, failure: "tooManyRows" },
    });
    const store = storeWith(setupView({ spreadsheet: { fileName: "clients.csv" } }));

    expect(await store.uploadSpreadsheet(new File(["Name"], "contacts.csv"))).toBe(true);
    expect(store.spreadsheetRejection).toEqual({ fileName: "contacts.csv", failure: "tooManyRows" });
    expect(actions.getWorkspaceSetupStatusAction).not.toHaveBeenCalled();

    actions.uploadWorkspaceSetupSpreadsheetAction.mockResolvedValueOnce({
      ok: true,
      data: { accepted: true, fileName: "contacts.csv", sheetName: "contacts", headers: ["Name"], rowCount: 1 },
    });
    await store.uploadSpreadsheet(new File(["Name\nAda"], "contacts.csv"));
    expect(store.spreadsheetRejection).toBeNull();
    expect(actions.getWorkspaceSetupStatusAction).toHaveBeenCalledOnce();
  });

  it("refuses a file over the size limit without sending it", async () => {
    const store = storeWith();
    const file = new File(["Name"], "export.csv");
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });

    expect(await store.uploadSpreadsheet(file)).toBe(false);
    expect(actions.uploadWorkspaceSetupSpreadsheetAction).not.toHaveBeenCalled();
    expect(store.spreadsheetRejection).toEqual({ fileName: "export.csv", failure: "fileTooLarge" });
  });

  it("polls only while something runs on the server", () => {
    expect(storeWith(setupView({ interview: { ...setupView().interview, prefill: "running" } })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "planning" })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "building" })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "completed" })).shouldPoll).toBe(false);
    expect(storeWith(setupView()).shouldPoll).toBe(false);
  });

  it("keeps polling while the website pre-fill still waits for the website to be read", () => {
    const waiting = storeWith(setupView({ interview: { ...setupView().interview, prefill: "idle" } }));
    expect(waiting.shouldPoll).toBe(true);
    expect(waiting.prefillRunning).toBe(true);
    const withoutWebsite = storeWith(
      setupView({ websiteUrl: null, interview: { ...setupView().interview, prefill: "idle" } }),
    );
    expect(withoutWebsite.shouldPoll).toBe(false);
    expect(withoutWebsite.prefillRunning).toBe(false);
  });

  it("holds the first answer to a part the website pre-fill fills until the owner chooses to answer it", () => {
    const store = storeWith(setupView({ interview: { ...setupView().interview, prefill: "running" } }));
    store.setAnswer("existingData", { format: "singleChoice", value: "sampleData" });
    expect(store.heldAnswer).toBeNull();
    expect(store.touched.has("existingData")).toBe(true);

    store.setAnswer("companyName", { format: "shortText", value: "A" });
    expect(store.heldAnswer).toEqual({ id: "companyName", value: { format: "shortText", value: "A" } });
    expect(store.answers.companyName).toBeUndefined();
    expect(store.touched.has("companyName")).toBe(false);

    store.answerDuringPrefill();
    expect(store.heldAnswer).toBeNull();
    expect(store.answers.companyName).toEqual({
      source: "user",
      confidence: 1,
      value: { format: "shortText", value: "A" },
    });
    expect(store.touched.has("companyName")).toBe(true);
    store.setAnswer("country", { format: "singleChoice", value: "DE" });
    expect(store.heldAnswer).toBeNull();
    expect(store.answers.country?.source).toBe("user");
  });

  it("drops the held answer when the owner waits for the website and asks only once per setup", () => {
    const running = setupView({ interview: { ...setupView().interview, prefill: "queued" } });
    const store = storeWith(running);
    store.setAnswer("teamSize", { format: "singleChoice", value: "solo" });
    store.waitForPrefill();
    expect(store.heldAnswer).toBeNull();
    expect(store.answers.teamSize).toBeUndefined();
    expect(store.touched.has("teamSize")).toBe(false);

    store.setAnswer("teamSize", { format: "singleChoice", value: "small" });
    expect(store.heldAnswer).toBeNull();
    expect(store.answers.teamSize?.value).toEqual({ format: "singleChoice", value: "small" });

    store.hydrate({ available: true, setup: { ...running, id: "00000000-0000-4000-8000-000000000999" } });
    store.setAnswer("teamSize", { format: "singleChoice", value: "solo" });
    expect(store.heldAnswer?.id).toBe("teamSize");
  });

  it("applies answers right away once the website pre-fill has finished", () => {
    const store = storeWith(setupView({ interview: { ...setupView().interview, prefill: "completed" } }));
    store.setAnswer("companyName", { format: "shortText", value: "Acme" });
    expect(store.heldAnswer).toBeNull();
    expect(store.answers.companyName?.source).toBe("user");
  });

  it("loads the confirmed answers and resets when a new setup appears", () => {
    const confirmed = { source: "user" as const, confidence: 1 };
    const store = storeWith(
      setupView({
        interview: {
          ...setupView().interview,
          answers: {
            companyName: { ...confirmed, value: { format: "shortText", value: "Acme" } },
          },
        },
      }),
    );
    expect(store.answers.companyName?.value).toEqual({ format: "shortText", value: "Acme" });

    store.hydrate({ available: true, setup: setupView({ id: "0a7a2d6e-0c4f-4b8e-9f43-8f0f3b1f0b11" }) });
    expect(store.answers).toEqual({});
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
