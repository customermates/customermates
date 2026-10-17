import type { Root } from "react-dom/client";
import type { UploadedSetupSpreadsheet } from "@/ee/workspace-setup/upload-workspace-setup-spreadsheet.interactor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  upload: vi.fn(),
  status: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({
  uploadWorkspaceSetupSpreadsheetAction: harness.upload,
  getWorkspaceSetupStatusAction: harness.status,
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupSpreadsheetUpload } from "../setup-spreadsheet-upload";
import { setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;

function render(spreadsheet: { fileName: string } | null) {
  const store = new WorkspaceSetupStore({} as never);
  store.hydrate({ available: true, setup: setupView({ spreadsheet }) });
  harness.rootStore = { workspaceSetupStore: store };
  act(() => root.render(createElement(SetupSpreadsheetUpload)));
  return store;
}

function fileInput() {
  const input = container.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("no file input");
  return input;
}

async function choose(fileName: string, outcome: UploadedSetupSpreadsheet) {
  harness.upload.mockResolvedValueOnce({ ok: true, data: outcome });
  const input = fileInput();
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["Name"], fileName)] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function alertText() {
  return container.querySelector('[role="alert"]')?.textContent ?? null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupSpreadsheetUpload", () => {
  it("offers only the formats the import reads", () => {
    render(null);
    expect(fileInput().accept.split(",")).toEqual([
      ".csv",
      ".xlsx",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
  });

  it("names a refused replacement and says the setup keeps the earlier file", async () => {
    render({ fileName: "clients.csv" });

    await choose("contacts.xls", { accepted: false, failure: "unsupportedFormat" });

    expect(alertText()).toBe(
      "WorkspaceSetup.interview.uploadRejected contacts.xls WorkspaceSetup.interview.uploadFailures.unsupportedFormat" +
        " WorkspaceSetup.interview.uploadKept clients.csv",
    );
    expect(container.textContent).toContain("clients.csv");
    expect(harness.status).not.toHaveBeenCalled();
  });

  it("names the limit a first file broke", async () => {
    render(null);

    await choose("export.csv", { accepted: false, failure: "tooManyRows" });

    expect(alertText()).toBe(
      "WorkspaceSetup.interview.uploadRejected export.csv WorkspaceSetup.interview.uploadFailures.tooManyRows 2000",
    );
  });
});
