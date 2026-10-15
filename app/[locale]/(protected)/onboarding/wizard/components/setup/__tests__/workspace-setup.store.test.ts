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

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SETUP_ID, setupPlan, setupView } from "./setup-view-fixture";

const website = { source: "website" as const, confidence: 0.9 };

function storeWith(view = setupView()) {
  const store = new WorkspaceSetupStore({} as RootStore);
  store.hydrate({ available: true, setup: view });
  return store;
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

  it("saves a confirmed screen and moves to the next one", async () => {
    const store = storeWith();
    store.setLocale("en");
    store.setAnswer("companyName", { format: "shortText", value: "Acme" });
    store.setAnswer("country", { format: "singleChoice", value: "DE" });
    store.setAnswer("currency", { format: "singleChoice", value: "EUR" });
    store.setAnswer("offerings", { format: "orderedList", items: [{ label: "Consulting" }] });
    store.setAnswer("customerKind", { format: "singleChoice", value: "consumers" });
    store.setAnswer("teamSize", { format: "singleChoice", value: "solo" });
    expect(store.canConfirmScreen).toBe(true);

    await store.confirmScreen();

    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalledWith(
      expect.objectContaining({
        setupId: SETUP_ID,
        answers: expect.objectContaining({ language: { format: "singleChoice", value: "en" } }),
      }),
    );
    expect(store.screenIndex).toBe(1);
    expect(actions.planWorkspaceSetupAction).not.toHaveBeenCalled();
  });

  it("asks for the plan after the last screen", async () => {
    const store = storeWith();
    store.setAnswer("existingData", { format: "singleChoice", value: "sampleData" });
    while (!store.isLastScreen) store.screenIndex += 1;

    await store.confirmScreen();

    expect(actions.saveWorkspaceSetupAnswersAction).toHaveBeenCalledOnce();
    expect(actions.planWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID });
    expect(actions.getWorkspaceSetupStatusAction).toHaveBeenCalled();
  });

  it("blocks Looks right on the data screen until a chosen spreadsheet is uploaded", () => {
    const store = storeWith();
    while (!store.isLastScreen) store.screenIndex += 1;
    store.setAnswer("existingData", { format: "singleChoice", value: "spreadsheet" });
    expect(store.canConfirmScreen).toBe(false);

    store.hydrate({ available: true, setup: setupView({ spreadsheet: { fileName: "contacts.csv" } }) });
    expect(store.canConfirmScreen).toBe(true);
  });

  it("re-plans through Adjust and returns to the plan", async () => {
    const planned = setupView({
      status: "planned",
      plan: { status: "completed", error: null, revision: 1, plan: setupPlan() },
    });
    const store = storeWith(planned);
    expect(store.stage).toBe("plan");

    store.adjust();
    expect(store.stage).toBe("interview");
    expect(store.screenIndex).toBe(0);
    while (!store.isLastScreen) store.screenIndex += 1;
    store.setAnswer("existingData", { format: "singleChoice", value: "empty" });

    await store.confirmScreen();

    expect(actions.adjustWorkspaceSetupAction).toHaveBeenCalledWith(expect.objectContaining({ setupId: SETUP_ID }));
    expect(actions.planWorkspaceSetupAction).not.toHaveBeenCalled();
    expect(store.adjusting).toBe(false);
  });

  it("reopens the questions of a failed plan and drafts a new plan from the changed answers", async () => {
    const store = storeWith(setupView({ plan: { status: "failed", error: "invalidPlan", revision: 2, plan: null } }));
    expect(store.stage).toBe("planFailed");

    store.adjust();
    expect(store.stage).toBe("interview");
    store.previousScreen();
    expect(store.stage).toBe("planFailed");

    store.adjust();
    while (!store.isLastScreen) store.screenIndex += 1;
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
      setupView({ status: "planned", plan: { status: "completed", error: null, revision: 3, plan: setupPlan() } }),
    );

    await store.build();

    expect(actions.confirmWorkspaceSetupAction).toHaveBeenCalledWith({ setupId: SETUP_ID, planRevision: 3 });
  });

  it("toasts a refused command and stays where it is", async () => {
    actions.retryWorkspaceSetupPhaseAction.mockResolvedValue({
      ok: false,
      failure: { kind: "conflict", issues: [{ code: "custom", path: [], message: "busy" }] },
    });
    const store = storeWith(setupView({ status: "failed" }));

    expect(await store.retryPhase("records")).toBe(false);
    expect(toast).toHaveBeenCalledOnce();
    expect(store.pending).toBeNull();
  });

  it("polls only while something runs on the server", () => {
    expect(storeWith(setupView({ interview: { ...setupView().interview, prefill: "running" } })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "planning" })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "building" })).shouldPoll).toBe(true);
    expect(storeWith(setupView({ status: "completed" })).shouldPoll).toBe(false);
    expect(storeWith(setupView()).shouldPoll).toBe(false);
  });

  it("resumes on the first unconfirmed screen and resets when a new setup appears", () => {
    const confirmed = {
      source: "user" as const,
      confidence: 1,
    };
    const store = storeWith(
      setupView({
        interview: {
          ...setupView().interview,
          answers: {
            companyName: { ...confirmed, value: { format: "shortText", value: "Acme" } },
            country: { ...confirmed, value: { format: "singleChoice", value: "DE" } },
            language: { ...confirmed, value: { format: "singleChoice", value: "de" } },
            currency: { ...confirmed, value: { format: "singleChoice", value: "EUR" } },
            offeringKinds: { ...confirmed, value: { format: "multipleChoice", values: [], custom: [] } },
            offerings: { ...confirmed, value: { format: "orderedList", items: [{ label: "A" }] } },
            customerKind: { ...confirmed, value: { format: "singleChoice", value: "consumers" } },
            industries: { ...confirmed, value: { format: "multipleChoice", values: [], custom: [] } },
            teamSize: { ...confirmed, value: { format: "singleChoice", value: "solo" } },
            teamRoles: { ...confirmed, value: { format: "multipleChoice", values: [], custom: [] } },
          },
        },
      }),
    );
    expect(store.screenIndex).toBe(1);

    store.hydrate({ available: true, setup: setupView({ id: "0a7a2d6e-0c4f-4b8e-9f43-8f0f3b1f0b11" }) });
    expect(store.screenIndex).toBe(0);
    expect(store.answers).toEqual({});
  });
});
