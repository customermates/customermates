import type { RootStore } from "@/core/stores/root.store";

import { makeAutoObservable, runInAction } from "mobx";

import { createApiKeyAction } from "../../../profile/actions";

export type StepAiChoice = "claudeCode" | "claudeDesktop" | "codex" | "cursor" | "gemini" | "skip";

const CHOICE_LABELS: Record<Exclude<StepAiChoice, "skip">, string> = {
  claudeCode: "Claude Code",
  claudeDesktop: "Claude Desktop",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
};

export class StepAiStore {
  choice: StepAiChoice | null = null;
  apiKey: string | null = null;
  isCreating = false;
  hasError = false;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable(this, { rootStore: false });
  }

  get canContinue(): boolean {
    return this.choice === "skip" || this.apiKey !== null;
  }

  setChoice = (choice: StepAiChoice) => {
    this.choice = choice;
    this.apiKey = null;
    this.hasError = false;
  };

  createApiKey = async () => {
    if (!this.choice || this.choice === "skip") return;

    this.isCreating = true;
    this.hasError = false;

    try {
      const res = await createApiKeyAction({
        name: CHOICE_LABELS[this.choice],
        expiresIn: 365 * 24 * 60 * 60,
      });
      runInAction(() => {
        if (res.ok) this.apiKey = res.data.key;
        else this.hasError = true;
      });
    } finally {
      runInAction(() => (this.isCreating = false));
    }
  };
}
