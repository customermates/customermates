import type { AgentProviderKeyCheck, AgentProviderKeyValidator } from "./agent-provider-key-validator";
import type { AgentProviderId } from "./agent-provider-models";

const ANTHROPIC_VERSION = "2023-06-01";
const CHECK_TIMEOUT_MS = 10_000;

const REJECTED_STATUSES = new Set([400, 401, 403]);

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "ok">>;

function request(provider: AgentProviderId, apiKey: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=1",
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      };
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${apiKey}` } };
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        headers: { "x-goog-api-key": apiKey },
      };
  }
}

export class FetchAgentProviderKeyValidator implements AgentProviderKeyValidator {
  constructor(private readonly doFetch: FetchLike = (url, init) => fetch(url, init)) {}

  async check(provider: AgentProviderId, apiKey: string): Promise<AgentProviderKeyCheck> {
    const { url, headers } = request(provider, apiKey);
    try {
      const response = await this.doFetch(url, {
        method: "GET",
        headers,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (response.ok) return "valid";
      return REJECTED_STATUSES.has(response.status) ? "invalid" : "unreachable";
    } catch {
      return "unreachable";
    }
  }
}
