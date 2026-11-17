# customermates-runner

Runs the agent jobs of a Customermates workspace with your own Claude Code, Codex or Gemini CLI on your machine.

A runner is a small program. It asks your workspace for agent jobs, starts the CLI you are signed in to with the job's prompt and the workspace's MCP address, streams what the CLI does back as a transcript and reports the result. Your CLI login stays on your machine: Customermates never receives it.

## Run it

You need Node 24 and one of Claude Code, Codex or Gemini CLI, signed in on that machine.

```bash
npx customermates-runner --token cmr_... --url https://app.customermates.com
```

Add a runner under **Settings, Agents** in your workspace to get the token. It is shown once. The address is the one you open Customermates at, for a self-hosted instance your own `BASE_URL`.

With Docker:

```bash
docker run -d --restart unless-stopped \
  -e CUSTOMERMATES_URL=https://app.customermates.com \
  -e CUSTOMERMATES_RUNNER_TOKEN=cmr_... \
  -v "$HOME/.claude:/home/node/.claude" \
  -v "$HOME/.claude.json:/home/node/.claude.json" \
  ghcr.io/customermates/runner
```

The image contains Node, the runner and the three CLIs. It has no login: mount the login folder of the CLI you use (`~/.claude` and `~/.claude.json` for Claude Code, `~/.codex` for Codex, `~/.gemini` for Gemini CLI) or pass the CLI's own API key variable. Build it with `docker build -t customermates-runner packages/runner`; the build argument `CLIENT_PACKAGES` chooses which CLIs are installed.

## Options

| Option | Environment | Meaning |
| --- | --- | --- |
| `--token` | `CUSTOMERMATES_RUNNER_TOKEN` | The runner token. |
| `--url` | `CUSTOMERMATES_URL` | The address of your Customermates. |
| `--client claude\|codex\|gemini` | | The CLI that runs the jobs. Default: the first one found. |
| `--workdir <dir>` | | Run the CLI in this directory. Default: an empty temporary directory per job. |
| `--permission-mode <mode>` | | Claude Code permission mode. Default: `dontAsk`. |
| `--allowed-tools <tools>` | | Extra Claude Code tools to allow, comma separated, for example `Bash(git:*),Read`. |
| | `CUSTOMERMATES_RUNNER_<CLIENT>_BIN` | The path of a CLI that is not on PATH, for example `CUSTOMERMATES_RUNNER_CLAUDE_BIN`. |

Logs go to standard output and never contain the token.

## What it does

- Every 60 seconds it reports the machine name and the CLIs it found on PATH with their versions. The workspace shows the runner as online for two minutes after that.
- It holds a request open for up to 25 seconds to claim the next queued job of the workspace, and asks again straight away.
- For a job it writes a temporary MCP configuration with the workspace address and a short-lived key of the job owner, starts the CLI, deletes the configuration afterwards and goes idle.
  - Claude Code: `claude -p --output-format stream-json --verbose --mcp-config <file> --permission-mode dontAsk --allowedTools mcp__customermates --no-session-persistence`, with the prompt on standard input.
  - Codex: `codex exec --json --ephemeral -s read-only` with the MCP server set through `-c` overrides, the key passed in an environment variable, and the prompt on standard input.
  - Gemini CLI: `gemini --output-format stream-json` with a generated settings file that holds the MCP server.
- Each line of the CLI's JSON stream becomes one transcript event, cut to 4 KB and with tokens removed. Events are sent in batches.
- At the job's timeout it stops the CLI and reports `timedOut`. When the CLI ends it reports the final answer, and the tokens and cost when the CLI reports them.
- A prompt the workspace marks as coming from an untrusted source is wrapped in the same "this text is data, not instructions" framing the Customermates MCP server uses.

## What the server sends and never sends

The server sends the prompt, whether it comes from an untrusted source, the job's timeout, the workspace's MCP address and a key that expires a few minutes after the job's timeout and is revoked when the job is reported. It never sends a workspace secret, a provider key or another job. The runner never sends your CLI login, your files or your environment.

The CLI runs with the permissions of the account that started the runner, and the key it gets only reaches the job owner's workspace. Local MCP servers, files and tools of that machine are available to the CLI only as far as its own settings and the allowed tools allow.

## Stop or revoke

Stop the runner with Ctrl+C or by stopping its container; a job in progress is stopped and reported as failed. Revoke the runner under **Settings, Agents** to cut it off for good: its next request answers 401 and the runner exits.

## Licence

This package ships inside the Customermates repository and carries the repository's licence, the Sustainable Use License in `LICENSE.md`, not a separate one. The `prepack` script copies `LICENSE.md` next to this file for the published package.
