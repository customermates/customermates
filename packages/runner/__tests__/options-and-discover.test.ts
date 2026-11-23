import { describe, expect, it } from "vitest";

import { binaryFor, chooseClient, discoverClients, usableClients, versionFromOutput } from "../src/discover.js";
import { parseOptions } from "../src/options.js";
import type { FoundClient } from "../src/types.js";

const TOKEN = `cmr_${"a".repeat(43)}`;

function options(argv: string[], env: Record<string, string | undefined> = {}) {
  const parsed = parseOptions(argv, env);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.options;
}

describe("runner options", () => {
  it("reads the token and url from the flags and notes that the token was on the command line", () => {
    expect(options(["--token", TOKEN, "--url", "https://customermates.com"])).toMatchObject({
      token: TOKEN,
      tokenOnCommandLine: true,
      url: "https://customermates.com",
      client: null,
      workdir: null,
      permissionMode: "dontAsk",
      settingSources: "project",
      allowedTools: [],
      allowShell: false,
      heartbeatMs: 60_000,
    });
  });

  it("takes the token from the environment and lets url flags win over the environment", () => {
    const env = { CUSTOMERMATES_RUNNER_TOKEN: TOKEN, CUSTOMERMATES_URL: "https://env.example.test/" };

    expect(options([], env)).toMatchObject({
      token: TOKEN,
      tokenOnCommandLine: false,
      url: "https://env.example.test",
    });
    expect(options(["--url=https://flag.example.test///"], env)).toMatchObject({ url: "https://flag.example.test" });
    expect(options(["--token", "cmr_other"], env)).toMatchObject({ token: TOKEN, tokenOnCommandLine: false });
  });

  it("reads the token from a file named by the flag or the environment, before anything else", () => {
    const url = ["--url", "http://localhost:4000"];
    const files: Record<string, string> = { "/run/secrets/runner": `${TOKEN}\n` };
    const read = (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error("ENOENT");
      return content;
    };
    const parse = (argv: string[], env: Record<string, string> = {}) => parseOptions([...argv, ...url], env, read);

    expect(parse(["--token-file", "/run/secrets/runner"])).toMatchObject({
      ok: true,
      options: { token: TOKEN, tokenOnCommandLine: false },
    });
    expect(
      parse([], { CUSTOMERMATES_RUNNER_TOKEN_FILE: "/run/secrets/runner", CUSTOMERMATES_RUNNER_TOKEN: "cmr_env" }),
    ).toMatchObject({ ok: true, options: { token: TOKEN } });
    expect(parse(["--token-file", "/missing"])).toEqual({
      ok: false,
      error: "The token file could not be read: /missing",
    });
  });

  it("accepts the setting sources of Claude Code and the shell switch of Codex", () => {
    const argv = ["--token", TOKEN, "--url", "http://localhost:4000"];

    expect(options([...argv, "--setting-sources", "user,project,local", "--allow-shell"])).toMatchObject({
      settingSources: "user,project,local",
      allowShell: true,
    });
    expect(options([...argv, "--allow-shell", "--client", "codex"])).toMatchObject({
      allowShell: true,
      client: "codex",
    });
  });

  it("accepts a client, a working directory, a permission mode and extra tools", () => {
    expect(
      options(
        [
          "--token",
          TOKEN,
          "--url",
          "http://localhost:4000",
          "--client",
          "codex",
          "--workdir",
          "/srv/work",
          "--permission-mode",
          "acceptEdits",
          "--allowed-tools",
          "Bash(git:*), Read ,",
          "--heartbeat-seconds",
          "5",
        ],
        {},
      ),
    ).toMatchObject({
      client: "codex",
      workdir: "/srv/work",
      permissionMode: "acceptEdits",
      allowedTools: ["Bash(git:*)", "Read"],
      heartbeatMs: 5000,
    });
  });

  it.each([
    [["--url", "http://localhost:4000"], "token"],
    [["--token", TOKEN], "address"],
    [["--token", TOKEN, "--url", "not a url"], "valid address"],
    [["--token", TOKEN, "--url", "http://localhost:4000", "--client", "vim"], "--client"],
    [["--token", TOKEN, "--url", "http://localhost:4000", "--heartbeat-seconds", "0"], "--heartbeat-seconds"],
    [["--token", TOKEN, "--url", "http://localhost:4000", "--nope", "1"], "Unknown option --nope"],
    [["--token", TOKEN, "stray"], "Unexpected argument stray"],
    [["--token"], "Missing value for --token"],
  ])("rejects %j with a message that names the problem", (argv, fragment) => {
    const parsed = parseOptions(argv, {});

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(fragment);
  });

  it("answers --help without needing a token", () => {
    expect(options(["--help"]).help).toBe(true);
    expect(options(["-h"]).help).toBe(true);
  });
});

describe("client discovery", () => {
  it("reads the version from the first line of --version output", () => {
    expect(versionFromOutput("2.1.318 (Claude Code)\n")).toBe("2.1.318");
    expect(versionFromOutput("codex-cli 0.166.0\n")).toBe("0.166.0");
    expect(versionFromOutput("\n\n1.2.3-beta.1+build\n")).toBe("1.2.3-beta.1+build");
    expect(versionFromOutput("")).toBeNull();
  });

  it("does not report a program that answers without a version number as a client", async () => {
    expect(versionFromOutput("some tool")).toBeNull();
    expect(versionFromOutput("command not found: codex")).toBeNull();

    const found = await discoverClients({}, (binary) => Promise.resolve(versionFromOutput(`${binary} is not a CLI`)));

    expect(found).toEqual([]);
  });

  it("reports only the client the runner was told to use", () => {
    const found: FoundClient[] = [
      { name: "claude", version: "1", binary: "claude" },
      { name: "codex", version: "1", binary: "codex" },
    ];

    expect(usableClients(found, null)).toEqual(found);
    expect(usableClients(found, "codex")).toEqual([found[1]]);
    expect(usableClients(found, "gemini")).toEqual([]);
  });

  it("lists the clients that answer, in the order claude, codex, gemini", async () => {
    const answers: Record<string, string | null> = { claude: "2.1.318", codex: "0.166.0", gemini: null };

    const found = await discoverClients({}, (binary) => Promise.resolve(answers[binary] ?? null));

    expect(found).toEqual([
      { name: "claude", version: "2.1.318", binary: "claude" },
      { name: "codex", version: "0.166.0", binary: "codex" },
    ]);
  });

  it("lets an environment variable point at a binary that is not on PATH", async () => {
    const env = { CUSTOMERMATES_RUNNER_GEMINI_BIN: "/opt/gemini/bin/gemini" };
    expect(binaryFor("gemini", env)).toBe("/opt/gemini/bin/gemini");
    expect(binaryFor("claude", env)).toBe("claude");

    const found = await discoverClients(env, (binary) => Promise.resolve(binary.startsWith("/opt") ? "0.9.0" : null));

    expect(found).toEqual([{ name: "gemini", version: "0.9.0", binary: "/opt/gemini/bin/gemini" }]);
  });

  it("chooses the first found client unless one was asked for", () => {
    const found: FoundClient[] = [
      { name: "codex", version: "1", binary: "codex" },
      { name: "gemini", version: "1", binary: "gemini" },
    ];

    expect(chooseClient(found, null)?.name).toBe("codex");
    expect(chooseClient(found, "gemini")?.name).toBe("gemini");
    expect(chooseClient(found, "claude")).toBeNull();
    expect(chooseClient([], null)).toBeNull();
  });
});
