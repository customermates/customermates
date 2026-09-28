import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WikiSemanticIndexRepo } from "../wiki-semantic-index.service";

import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@/ee/agent-chat/agent-availability", () => ({ isAgentChatAvailable: () => true }));

import { WikiEmbeddingService } from "../wiki-embedding.service";
import { WikiSemanticIndexDispatcher } from "../wiki-semantic-index-scheduler";

const failingUsage = {
  prepareRetrieval: vi.fn(() => Promise.reject(new Error("Adjusted AI credit allowance is invalid."))),
  prepareWorkspaceIndexing: vi.fn(() => Promise.reject(new Error("Workspace AI credit allowance is invalid."))),
} as unknown as AgentUsageService;

describe("Wiki retrieval fails safe", () => {
  it("treats an unreadable credit state as no semantic search", async () => {
    const embeddings = new WikiEmbeddingService(failingUsage);
    await expect(embeddings.authorizeQuery({ id: "user", companyId: "company" })).resolves.toBeNull();
    await expect(embeddings.authorizeIndexing("company")).resolves.toBeNull();
  });

  it("never lets index scheduling break the page write that triggered it", async () => {
    const dispatch = vi.fn();
    const repo = {
      semanticIndexAvailable: vi.fn(() => Promise.reject(new Error("database unavailable"))),
    } as unknown as WikiSemanticIndexRepo;
    const scheduler = new WikiSemanticIndexDispatcher(
      repo,
      new WikiEmbeddingService(failingUsage),
      { dispatch } as unknown as BackgroundTaskService,
      "write",
    );

    await expect(runWithTenant(createMockUser(), () => scheduler.schedule())).resolves.toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
