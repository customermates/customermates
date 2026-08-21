import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppErrorCode, AuthError, DemoModeError, ForbiddenError } from "@/core/errors/app-errors";
import {
  createZodError,
  interactorFailureKind,
  interactorFailureStatus,
  serializeInteractorFailure,
} from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve({
      raw: (key: string) => `localized:${key}`,
    }),
}));

import { executeMcpTool, expectedMcpToolFailure, mcpInteractorFailure, type McpTool } from "../mcp-tool";

function testTool(execute: McpTool["execute"]): McpTool {
  return {
    name: "test_tool",
    title: "Test tool",
    description: "Test tool",
    inputSchema: z.object({}),
    execute,
  };
}

describe("MCP tool execution contract", () => {
  it("preserves text and structured success results", async () => {
    await expect(
      executeMcpTool(
        testTool(() => "done"),
        [{}],
      ),
    ).resolves.toEqual({ ok: true, result: "done" });
    await expect(
      executeMcpTool(
        testTool(() => ({
          text: "done",
          structuredContent: { id: "record-1" },
        })),
        [{}],
      ),
    ).resolves.toEqual({
      ok: true,
      result: "done",
      structuredContent: { id: "record-1" },
    });
  });

  it("preserves canonical returned failures", async () => {
    const error = createZodError("Missing service", ["id"], {
      error: CustomErrorCode.serviceNotFound,
    });
    const failure = mcpInteractorFailure(error);

    await expect(
      executeMcpTool(
        testTool(() => failure),
        [{}],
      ),
    ).resolves.toEqual({
      ok: false,
      result: failure.text,
      failure: {
        kind: "not_found",
        issues: [
          {
            code: "custom",
            path: ["id"],
            message: "Missing service",
            customCode: "serviceNotFound",
          },
        ],
      },
    });
  });

  it("adapts the legacy validation text during migration", async () => {
    await expect(
      executeMcpTool(
        testTool(() => "Validation error: bad input"),
        [{}],
      ),
    ).resolves.toMatchObject({
      ok: false,
      result: "Validation error: bad input",
      failure: { kind: "validation", issues: [{ message: "bad input" }] },
    });
  });

  it.each([
    [new AuthError(), "authentication", "notAuthenticated"],
    [new ForbiddenError(), "authorization", "permissionDenied"],
    [new ForbiddenError("Inactive", AppErrorCode.inactiveUser), "authorization", "userInactive"],
    [new DemoModeError(), "authorization", "demoMode"],
  ])("normalizes expected access failures without exposing raw messages", async (error, kind, customCode) => {
    const result = await executeMcpTool(
      testTool(() => {
        throw error;
      }),
      [{}],
    );

    expect(result).toMatchObject({
      ok: false,
      result: `localized:${customCode}`,
      failure: {
        kind,
        issues: [{ message: `localized:${customCode}`, customCode }],
      },
    });
  });

  it("normalizes an access failure wrapped through multiple adapter layers", async () => {
    const accessError = new ForbiddenError("inactive raw detail", AppErrorCode.inactiveUser);
    const wrapped = new Error("outer adapter", { cause: new Error("inner adapter", { cause: accessError }) });

    await expect(
      executeMcpTool(
        testTool(() => {
          throw wrapped;
        }),
        [{}],
      ),
    ).resolves.toMatchObject({
      ok: false,
      result: "localized:userInactive",
      failure: {
        kind: "authorization",
        issues: [{ message: "localized:userInactive", customCode: "userInactive" }],
      },
    });
  });

  it.each([
    ["P2025", "not_found", "The requested record was not found"],
    ["P2002", "conflict", "That value conflicts with an existing record"],
    ["P2023", "validation", "Invalid identifier"],
  ])("normalizes supported Prisma %s failures", async (code, kind, message) => {
    await expect(
      executeMcpTool(
        testTool(() => {
          throw Object.assign(new Error("Expected Prisma failure"), { code });
        }),
        [{}],
      ),
    ).resolves.toMatchObject({
      ok: false,
      result: message,
      failure: { kind, issues: [{ message }] },
    });
  });

  it("rethrows unexpected errors and thrown Zod invariant failures unchanged", async () => {
    const unexpected = new Error("secret database detail");
    const invariant = createZodError("invalid output invariant");

    await expect(
      executeMcpTool(
        testTool(() => {
          throw unexpected;
        }),
        [{}],
      ),
    ).rejects.toBe(unexpected);
    await expect(expectedMcpToolFailure(invariant)).resolves.toBeNull();
  });

  it("serializes only safe issue fields and classifies stable custom codes", () => {
    const error = createZodError("Conversation missing", ["conversationId"], {
      error: CustomErrorCode.agentConversationNotFound,
      secret: "do-not-serialize",
    });

    expect(serializeInteractorFailure(error)).toEqual({
      kind: "not_found",
      issues: [
        {
          code: "custom",
          path: ["conversationId"],
          message: "Conversation missing",
          customCode: "agentConversationNotFound",
        },
      ],
    });
    expect(JSON.stringify(serializeInteractorFailure(error))).not.toContain("do-not-serialize");
    expect(interactorFailureKind(error)).toBe("not_found");
    expect(interactorFailureStatus(error)).toBe(404);
  });

  it("defaults unclassified issues to validation and HTTP 400", () => {
    const error = new z.ZodError([
      {
        code: "invalid_type",
        expected: "string",
        path: ["name"],
        message: "Expected string",
      },
    ]);
    expect(interactorFailureKind(error)).toBe("validation");
    expect(interactorFailureStatus(error)).toBe(400);
  });

  it.each([
    [CustomErrorCode.notAuthenticated, "authentication", 401],
    [CustomErrorCode.userSelfAdminUpdateForbidden, "authorization", 403],
    [CustomErrorCode.roleSystemImmutable, "conflict", 409],
    [CustomErrorCode.agentLimitReached, "rate_limit", 429],
    [CustomErrorCode.legalNoticeNotDelivered, "unavailable", 422],
  ])("classifies %s consistently as %s", (customCode, kind, status) => {
    const error = createZodError("Expected failure", [], { error: customCode });

    expect(interactorFailureKind(error)).toBe(kind);
    expect(interactorFailureStatus(error)).toBe(status);
    expect(serializeInteractorFailure(error)).toMatchObject({ kind, issues: [{ customCode }] });
  });
});
