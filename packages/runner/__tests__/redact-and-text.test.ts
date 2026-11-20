import { describe, expect, it } from "vitest";

import { REDACTED, redactText, redactValue } from "../src/redact.js";
import { DIGEST_MAX, clip, digest, storable } from "../src/text.js";
import { resolveWindowsCommand, windowsCommandPlan } from "../src/windows-command.js";

const RUNNER_TOKEN = `cmr_${"A1b2".repeat(11)}`.slice(0, 47);

describe("redaction", () => {
  it("removes every given secret from text, wherever it appears", () => {
    const text = `token=${RUNNER_TOKEN} and again ${RUNNER_TOKEN}, job key job-key-123456`;

    const result = redactText(text, [RUNNER_TOKEN, "job-key-123456"]);

    expect(result).toBe(`token=${REDACTED} and again ${REDACTED}, job key ${REDACTED}`);
  });

  it("removes anything shaped like a runner token or a bearer header even when it is not given", () => {
    expect(redactText(`seen ${RUNNER_TOKEN} here`)).toBe(`seen ${REDACTED} here`);
    expect(redactText("Authorization: Bearer abcdefghijklmnop12345")).toBe(`Authorization: ${REDACTED}`);
    expect(redactText("a short bearer word")).toBe("a short bearer word");
  });

  it("ignores secrets too short to be a secret instead of mangling the text", () => {
    expect(redactText("a b c abc", ["a", ""])).toBe("a b c abc");
  });

  it("redacts inside nested objects and arrays and leaves other values alone", () => {
    const event = {
      type: "tool_use",
      input: { headers: { "x-api-key": "job-key-123456" }, list: ["ok", "job-key-123456"], count: 2, flag: true },
      nothing: null,
    };

    expect(redactValue(event, ["job-key-123456"])).toEqual({
      type: "tool_use",
      input: { headers: { "x-api-key": REDACTED }, list: ["ok", REDACTED], count: 2, flag: true },
      nothing: null,
    });
    expect(JSON.stringify(event)).toContain("job-key-123456");
  });
});

describe("text the server can store", () => {
  const emoji = "\u{1F600}";

  it("drops NUL characters and replaces half a surrogate pair, and leaves whole pairs alone", () => {
    expect(storable("a\u0000b\u0000")).toBe("ab");
    expect(storable("high \ud83d alone")).toBe("high \ufffd alone");
    expect(storable("\ude00 low first")).toBe("\ufffd low first");
    expect(storable(`fine ${emoji} text`)).toBe(`fine ${emoji} text`);
  });

  it("cuts to the limit without splitting a surrogate pair", () => {
    expect(clip("x".repeat(10), 4)).toBe("xxxx");
    expect(clip(`abc${emoji}def`, 4)).toBe("abc");
    expect(clip(`abc${emoji}def`, 5)).toBe(`abc${emoji}`);
    expect(clip("short", 10)).toBe("short");
    expect(clip(`${"\u0000".repeat(5)}abc`, 3)).toBe("abc");
  });

  it("digests tool arguments and results of any shape into a short storable text", () => {
    expect(digest({ q: "open", limit: 5 })).toBe('{"q":"open","limit":5}');
    expect(digest("plain")).toBe("plain");
    expect(digest(undefined)).toBe("");
    expect(digest(null)).toBe("");
    expect(digest({ text: "y".repeat(1000) })).toHaveLength(DIGEST_MAX);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(digest(circular)).toBe("");
  });
});

describe("starting a client on Windows", () => {
  const env = { PATH: "C:\\Tools;C:\\Users\\ben\\AppData\\Roaming\\npm", PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  const files = new Set([
    "c:\\tools\\codex.exe",
    "c:\\users\\ben\\appdata\\roaming\\npm\\claude.cmd",
    "c:\\users\\ben\\appdata\\roaming\\npm\\claude",
  ]);
  const exists = (path: string) => files.has(path.toLowerCase());

  it("finds a bare name through PATH and PATHEXT, as the shell does", () => {
    expect(resolveWindowsCommand("codex", env, exists)).toBe("C:\\Tools\\codex.EXE");
    expect(resolveWindowsCommand("claude", env, exists)).toBe("C:\\Users\\ben\\AppData\\Roaming\\npm\\claude.CMD");
    expect(resolveWindowsCommand("gemini", env, exists)).toBe("gemini");
    expect(resolveWindowsCommand("C:\\Tools\\codex.exe", env, exists)).toBe("C:\\Tools\\codex.exe");
  });

  it("starts an executable directly with its arguments untouched", () => {
    expect(windowsCommandPlan("codex", ["exec", "-c", 'approval_policy="never"'], env, exists)).toEqual({
      command: "C:\\Tools\\codex.EXE",
      args: ["exec", "-c", 'approval_policy="never"'],
      verbatim: false,
    });
  });

  it("starts an npm .cmd shim through cmd.exe with every argument quoted and its special characters escaped", () => {
    const plan = windowsCommandPlan("claude", ["-p", "--allowedTools", "mcp__customermates,Bash(git:*)"], env, exists);

    expect(plan.command).toBe("cmd.exe");
    expect(plan.verbatim).toBe(true);
    expect(plan.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(plan.args[3]).toBe(
      '"C:\\Users\\ben\\AppData\\Roaming\\npm\\claude.CMD ^^^"-p^^^" ^^^"--allowedTools^^^" ^^^"mcp__customermates^^^,Bash^^^(git:^^^*^^^)^^^""',
    );
  });

  it("keeps an argument with quotes, spaces and shell operators one argument", () => {
    const [, , , line] = windowsCommandPlan("claude", ['say "hi" & del *', "trailing\\"], env, exists).args;

    expect(line).toContain('^^^"say^^^ \\^^^"hi\\^^^"^^^ ^^^&^^^ del^^^ ^^^*^^^"');
    expect(line).toContain('^^^"trailing\\\\^^^"');
    expect(line).not.toMatch(/(?<!\^) & /u);
  });

  it("uses the ComSpec of the machine when it is set", () => {
    expect(
      windowsCommandPlan("claude", [], { ...env, ComSpec: "C:\\Windows\\System32\\cmd.exe" }, exists).command,
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });
});
