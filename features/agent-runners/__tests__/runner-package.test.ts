import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MCP_UNTRUSTED_CONTENT_INSTRUCTION } from "@/features/mcp-tools/server-instructions";

import { AgentTranscriptEventSchema } from "@/features/agent-jobs/agent-job.schema";

import { CODEX_FEATURES_READ_FROM } from "../../../packages/runner/src/clients/codex";
import { CLIENT_ADAPTERS } from "../../../packages/runner/src/clients/index";
import { RUNNER_ERRORS } from "../../../packages/runner/src/run-job";
import { ERROR_MAX, TEXT_MAX } from "../../../packages/runner/src/text";
import { UNTRUSTED_CONTENT_INSTRUCTION } from "../../../packages/runner/src/untrusted";
import {
  AGENT_RUNNER_JOB_ERRORS,
  AGENT_RUNNER_LIMITS,
  AgentJobEventsBodySchema,
  AgentJobResultBodySchema,
} from "../agent-runner.schema";

const PACKAGE_ROOT = join(__dirname, "..", "..", "..", "packages", "runner");

function read(path: string): string {
  return readFileSync(join(PACKAGE_ROOT, path), "utf8");
}

describe("the customermates-runner package", () => {
  it("uses exactly the untrusted-content wording of the MCP server", () => {
    expect(UNTRUSTED_CONTENT_INSTRUCTION).toBe(MCP_UNTRUSTED_CONTENT_INSTRUCTION);
  });

  it("carries the repository licence, installs with npx and needs Node 24", () => {
    const manifest = JSON.parse(read("package.json")) as {
      name: string;
      license: string;
      bin: Record<string, string>;
      engines: { node: string };
      files: string[];
      dependencies?: unknown;
    };
    const rootManifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "..", "..", "package.json"), "utf8")) as {
      license: string;
    };

    expect(manifest.name).toBe("customermates-runner");
    expect(manifest.license).toBe(rootManifest.license);
    expect(manifest.bin).toEqual({ "customermates-runner": "dist/cli.js" });
    expect(manifest.engines.node).toBe(">=24");
    expect(manifest.files).toContain("LICENSE.md");
    expect(manifest.dependencies).toBeUndefined();
  });

  it("says in its README that it carries the repository licence and shows the one-line install and the Docker command", () => {
    const readme = read("README.md");

    expect(readme).toContain("CUSTOMERMATES_RUNNER_TOKEN=cmr_... npx customermates-runner --url");
    expect(readme).not.toContain("npx customermates-runner --token");
    expect(readme).toContain("--token-file");
    expect(readme).toContain("docker run");
    expect(readme).toContain('-v "$HOME/.claude.json:/home/node/.claude.json"');
    expect(readme).toContain("Keychain");
    expect(readme).toContain("Sustainable Use License");
    expect(readme).not.toMatch(/AGPL|Affero|MIT/u);
    expect(readme).not.toContain(String.fromCharCode(0x2014));
  });

  it("says plainly what a CLI on the machine can still reach", () => {
    const readme = read("README.md");

    expect(readme).toContain("## Limits you should know");
    expect(readme).toContain("stops writes but not reads");
    expect(readme).toContain("can still be talked into following such text");
    expect(readme).toContain("at most 25 tool calls");
  });

  it("sends transcript events and results the server accepts and the workspace can read, for every client", () => {
    const at = "2026-11-17T09:00:00.000Z";
    const streams: Record<string, Array<Record<string, unknown>>> = {
      claude: [
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Looking" },
              { type: "tool_use", id: "toolu_1", name: "mcp__customermates__search_crm_records", input: { q: "a" } },
            ],
          },
        },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "2 rows" }] } },
      ],
      codex: [
        {
          type: "item.started",
          item: { id: "i1", type: "mcp_tool_call", server: "customermates", tool: "read_crm_record", arguments: {} },
        },
        {
          type: "item.completed",
          item: { id: "i1", type: "mcp_tool_call", tool: "read_crm_record", status: "completed", result: { ok: true } },
        },
        { type: "item.completed", item: { id: "i2", type: "agent_message", text: "Done" } },
      ],
      gemini: [
        { type: "message", role: "assistant", content: "Look", delta: true },
        { type: "tool_use", tool_name: "search_crm_records", tool_id: "g1", parameters: { q: "a" } },
        { type: "tool_result", tool_id: "g1", status: "success", output: "1 row" },
      ],
    };

    for (const [name, lines] of Object.entries(streams)) {
      const observer = CLIENT_ADAPTERS[name as keyof typeof CLIENT_ADAPTERS].createObserver();
      const events = [...lines.flatMap((line) => observer.observe(line, at)), ...observer.flush(at)];
      const finish = { type: "finish", at, reason: "stop", text: "Done" };
      const body = AgentJobEventsBodySchema.safeParse({ attempt: 1, events: [...events, finish] });

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(body.success).toBe(true);
      if (!body.success) continue;
      for (const stored of body.data.events) expect(AgentTranscriptEventSchema.safeParse(stored).success).toBe(true);
    }
  });

  it("names its failures with the codes the workspace has labels for", () => {
    expect(RUNNER_ERRORS).toEqual({ timedOut: "timedOut", stopped: "runnerStopped" });
    expect(AGENT_RUNNER_JOB_ERRORS.timedOut).toBe(RUNNER_ERRORS.timedOut);
    expect(TEXT_MAX).toBe(AGENT_RUNNER_LIMITS.summaryMaxLength);
    expect(ERROR_MAX).toBeLessThanOrEqual(AGENT_RUNNER_LIMITS.errorMaxLength);
    expect(
      AgentJobResultBodySchema.safeParse({
        attempt: 1,
        status: "failed",
        error: RUNNER_ERRORS.stopped,
        summary: "x".repeat(TEXT_MAX),
      }).success,
    ).toBe(true);
  });

  it("ships a Dockerfile that builds the package and runs it as a non-root user under an init process", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("FROM node:24");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("apt-get install -y --no-install-recommends tini");
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/dist/cli.js"]');
    expect(existsSync(join(PACKAGE_ROOT, "src", "cli.ts"))).toBe(true);
  });

  it("installs each CLI in the image in exactly the version the README says the flags were checked against", () => {
    const packages = /ARG CLIENT_PACKAGES="([^"]+)"/u.exec(read("Dockerfile"))?.[1].split(" ") ?? [];
    const readme = read("README.md");

    expect(packages).toEqual([
      "@anthropic-ai/claude-code@2.1.326",
      `@openai/codex@${CODEX_FEATURES_READ_FROM}`,
      "@google/gemini-cli@0.68.0",
    ]);
    expect(readme).toContain(
      `checked against the help of Claude Code 2.1.326, Codex CLI ${CODEX_FEATURES_READ_FROM} and Gemini CLI 0.68.0`,
    );
  });
});
