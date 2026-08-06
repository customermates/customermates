import type { RootStore } from "@/core/stores/root.store";
import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { makeAutoObservable, runInAction } from "mobx";

import { createApiKeyAction } from "../../../profile/actions";

export const STEP_AI_PROVIDERS = ["claude", "chatgpt", "codex", "cursor", "gemini"] as const;

export type StepAiProvider = (typeof STEP_AI_PROVIDERS)[number];
export type StepAiClaudeMethod = "account" | "local";
export type StepAiClaudeClient = Extract<McpTool, "claudeCode" | "claudeDesktop">;
export type StepAiDirectProvider = Exclude<StepAiProvider, "claude">;

export type StepAiRoute =
  | { screen: "providers" }
  | { screen: "claude" }
  | { screen: "setup"; provider: StepAiDirectProvider }
  | { screen: "skip" };

type StepAiCredential = {
  id: string;
  key: string;
};

const PROVIDER_TO_TOOL: Partial<Record<StepAiDirectProvider, McpTool>> = {
  codex: "codex",
  cursor: "cursor",
  gemini: "gemini",
};

const TOOL_LABELS: Record<McpTool, string> = {
  claudeCode: "Claude Code",
  claudeDesktop: "Claude Desktop",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
};

export class StepAiStore {
  route: StepAiRoute = { screen: "providers" };
  selectedProvider: StepAiProvider | null = null;
  claudeMethod: StepAiClaudeMethod | null = null;
  claudeClient: StepAiClaudeClient | null = null;
  credentials: Partial<Record<McpTool, StepAiCredential>> = {};
  pendingTool: McpTool | null = null;
  errorTool: McpTool | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable(this, { rootStore: false });
  }

  get screen(): StepAiRoute["screen"] {
    return this.route.screen;
  }

  get connectorProvider(): Extract<StepAiProvider, "claude" | "chatgpt"> | null {
    if (this.route.screen === "claude" && this.claudeMethod === "account") return "claude";
    if (this.route.screen === "setup" && this.route.provider === "chatgpt") return "chatgpt";
    return null;
  }

  get selectedTool(): McpTool | null {
    if (this.route.screen === "claude" && this.claudeMethod === "local") return this.claudeClient;
    if (this.route.screen !== "setup") return null;
    return PROVIDER_TO_TOOL[this.route.provider] ?? null;
  }

  get credential(): StepAiCredential | null {
    return this.selectedTool ? (this.credentials[this.selectedTool] ?? null) : null;
  }

  get apiKey(): string | null {
    return this.credential?.key ?? null;
  }

  get isCreating(): boolean {
    return this.pendingTool !== null;
  }

  get hasError(): boolean {
    return this.selectedTool !== null && this.errorTool === this.selectedTool;
  }

  get canFinish(): boolean {
    if (this.isCreating) return false;
    if (this.route.screen === "skip") return true;
    if (this.connectorProvider) return true;
    return this.selectedTool !== null && this.credential !== null;
  }

  selectProvider = (provider: StepAiProvider) => {
    if (this.isCreating) return;

    this.selectedProvider = provider;
    this.errorTool = null;
    this.route = provider === "claude" ? { screen: "claude" } : { screen: "setup", provider };
  };

  selectClaudeMethod = (method: StepAiClaudeMethod) => {
    if (this.isCreating || this.route.screen !== "claude") return;

    this.claudeMethod = method;
    this.errorTool = null;
  };

  selectClaudeClient = (client: StepAiClaudeClient) => {
    if (this.isCreating || this.route.screen !== "claude" || this.claudeMethod !== "local") return;

    this.claudeClient = client;
    this.errorTool = null;
  };

  selectSkip = () => {
    if (this.isCreating) return;

    this.errorTool = null;
    this.route = { screen: "skip" };
  };

  backToProviders = () => {
    if (this.isCreating) return;

    this.errorTool = null;
    this.route = { screen: "providers" };
  };

  createApiKey = async () => {
    const tool = this.selectedTool;
    if (!tool || this.pendingTool !== null || this.credentials[tool]) return;

    this.pendingTool = tool;
    this.errorTool = null;

    try {
      const res = await createApiKeyAction({
        name: TOOL_LABELS[tool],
        expiresIn: 365 * 24 * 60 * 60,
      });

      runInAction(() => {
        if (res.ok) {
          this.credentials = {
            ...this.credentials,
            [tool]: { id: res.data.id, key: res.data.key },
          };
        } else this.errorTool = tool;
      });
    } catch {
      runInAction(() => {
        this.errorTool = tool;
      });
    } finally {
      runInAction(() => {
        if (this.pendingTool === tool) this.pendingTool = null;
      });
    }
  };
}
