import type { $ZodErrorTree } from "zod/v4/core";
import type { RootStore } from "@/core/stores/root.store";
import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { makeAutoObservable, runInAction } from "mobx";

import { createApiKeyAction } from "@/app/[locale]/(protected)/profile/actions";
import { API_KEY_QUICK_CONNECTION_EXPIRATION_SECONDS } from "@/features/api-key/api-key-expiration";

export const AI_CONNECTION_PROVIDERS = ["claude", "openai", "cursor", "gemini"] as const;

export type AiConnectionProvider = (typeof AI_CONNECTION_PROVIDERS)[number];
export type AiConnectionClaudeMethod = "account" | "local";
export type AiConnectionClaudeClient = Extract<McpTool, "claudeCode" | "claudeDesktop">;
export type AiConnectionOpenAiMethod = "chatgpt" | "codex";
export type AiConnectionDirectProvider = Exclude<AiConnectionProvider, "claude" | "openai">;

export type AiConnectionRoute =
  | { screen: "providers" }
  | { screen: "claude" }
  | { screen: "openai" }
  | { screen: "setup"; provider: AiConnectionDirectProvider }
  | { screen: "skip" };

export type AiConnectionCredential = {
  id: string;
  key: string;
};

export type AiConnectionCreateResult =
  | { status: "created"; credential: AiConnectionCredential }
  | { status: "existing"; credential: AiConnectionCredential }
  | { status: "failed"; error?: $ZodErrorTree<unknown> }
  | { status: "ignored" };

const PROVIDER_TO_TOOL: Record<AiConnectionDirectProvider, McpTool> = {
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

export class AiConnectionStore {
  route: AiConnectionRoute = { screen: "providers" };
  selectedProvider: AiConnectionProvider | null = null;
  claudeMethod: AiConnectionClaudeMethod | null = null;
  claudeClient: AiConnectionClaudeClient | null = null;
  openAiMethod: AiConnectionOpenAiMethod | null = null;
  credentials: Partial<Record<McpTool, AiConnectionCredential>> = {};
  pendingTool: McpTool | null = null;
  errorTool: McpTool | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeAutoObservable(this, { rootStore: false });
  }

  get screen(): AiConnectionRoute["screen"] {
    return this.route.screen;
  }

  get connectorProvider(): "claude" | "chatgpt" | null {
    if (this.route.screen === "claude" && this.claudeMethod === "account") return "claude";
    if (this.route.screen === "openai" && this.openAiMethod === "chatgpt") return "chatgpt";
    return null;
  }

  get selectedTool(): McpTool | null {
    if (this.route.screen === "claude" && this.claudeMethod === "local") return this.claudeClient;
    if (this.route.screen === "openai" && this.openAiMethod === "codex") return "codex";
    if (this.route.screen !== "setup") return null;
    return PROVIDER_TO_TOOL[this.route.provider];
  }

  get credential(): AiConnectionCredential | null {
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

  reset = () => {
    if (this.isCreating) return;

    this.route = { screen: "providers" };
    this.selectedProvider = null;
    this.claudeMethod = null;
    this.claudeClient = null;
    this.openAiMethod = null;
    this.credentials = {};
    this.errorTool = null;
  };

  selectProvider = (provider: AiConnectionProvider) => {
    if (this.isCreating) return;

    this.selectedProvider = provider;
    this.errorTool = null;
    this.route =
      provider === "claude"
        ? { screen: "claude" }
        : provider === "openai"
          ? { screen: "openai" }
          : { screen: "setup", provider };
  };

  selectClaudeMethod = (method: AiConnectionClaudeMethod) => {
    if (this.isCreating || this.route.screen !== "claude") return;

    this.claudeMethod = method;
    this.errorTool = null;
  };

  selectClaudeClient = (client: AiConnectionClaudeClient) => {
    if (this.isCreating || this.route.screen !== "claude" || this.claudeMethod !== "local") return;

    this.claudeClient = client;
    this.errorTool = null;
  };

  selectOpenAiMethod = (method: AiConnectionOpenAiMethod) => {
    if (this.isCreating || this.route.screen !== "openai") return;

    this.openAiMethod = method;
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

  createApiKey = async (): Promise<AiConnectionCreateResult> => {
    const tool = this.selectedTool;
    if (!tool || this.pendingTool !== null) return { status: "ignored" };

    const existing = this.credentials[tool];
    if (existing) return { status: "existing", credential: existing };

    this.pendingTool = tool;
    this.errorTool = null;

    try {
      const res = await createApiKeyAction({
        name: TOOL_LABELS[tool],
        expiresIn: API_KEY_QUICK_CONNECTION_EXPIRATION_SECONDS,
      });

      if (!res.ok) {
        runInAction(() => {
          this.errorTool = tool;
        });
        return { status: "failed", error: res.error };
      }

      const credential = { id: res.data.id, key: res.data.key };
      runInAction(() => {
        this.credentials = { ...this.credentials, [tool]: credential };
      });
      return { status: "created", credential };
    } catch {
      runInAction(() => {
        this.errorTool = tool;
      });
      return { status: "failed" };
    } finally {
      runInAction(() => {
        if (this.pendingTool === tool) this.pendingTool = null;
      });
    }
  };
}
