# customermates-runner

Runs your own agent jobs of a Customermates workspace with your Claude Code, Codex or Gemini CLI on your machine.

A runner is a small program. It asks your workspace for the agent jobs of the member who added it, starts the CLI you are signed in to with the job's prompt and the workspace's MCP address, sends what the CLI does back as a transcript and reports the result. Your CLI login stays on your machine: Customermates never receives it.

## Run it

You need Node 24 and one of Claude Code, Codex or Gemini CLI, signed in on that machine.

```bash
CUSTOMERMATES_RUNNER_TOKEN=cmr_... npx customermates-runner --url https://app.customermates.com
```

Add a runner under **Settings, Agents** in your workspace to get the token. It is shown once. The address is the one you open Customermates at, for a self-hosted instance your own `BASE_URL`.

Give the runner its token in the environment variable `CUSTOMERMATES_RUNNER_TOKEN`, or in a file only your account can read (`chmod 600`) named with `--token-file` or `CUSTOMERMATES_RUNNER_TOKEN_FILE`. `--token cmr_...` also works, but a command line is visible to every user of the machine, so the runner warns when you use it. On Windows set the variable first (`set CUSTOMERMATES_RUNNER_TOKEN=cmr_...` in cmd, `$env:CUSTOMERMATES_RUNNER_TOKEN = "cmr_..."` in PowerShell) and then run `npx customermates-runner --url ...`.

With Docker:

```bash
docker run -d --restart unless-stopped \
  -e CUSTOMERMATES_URL=https://app.customermates.com \
  -e CUSTOMERMATES_RUNNER_TOKEN=cmr_... \
  -v "$HOME/.claude:/home/node/.claude" \
  -v "$HOME/.claude.json:/home/node/.claude.json" \
  ghcr.io/customermates/runner
```

The image contains Node, the runner and the three CLIs. It has no login: mount the login folder of the CLI you use (`~/.claude` and `~/.claude.json` for Claude Code, `~/.codex` for Codex, `~/.gemini` for Gemini CLI) or pass the CLI's own API key variable. On macOS Claude Code keeps its login in the Keychain, not in `~/.claude`, so the mount carries no login into the container: pass `ANTHROPIC_API_KEY` or a token from `claude setup-token` in `CLAUDE_CODE_OAUTH_TOKEN` instead. Build the image with `docker build -t customermates-runner packages/runner`; the build argument `CLIENT_PACKAGES` chooses which CLIs are installed.

## Options

| Option | Environment | Meaning |
| --- | --- | --- |
| | `CUSTOMERMATES_RUNNER_TOKEN` | The runner token. |
| `--token-file <file>` | `CUSTOMERMATES_RUNNER_TOKEN_FILE` | A file that holds the runner token. |
| `--token <token>` | | The runner token on the command line. Visible to other users of the machine. |
| `--url` | `CUSTOMERMATES_URL` | The address of your Customermates. |
| `--client claude\|codex\|gemini` | | The CLI that runs the jobs. Default: the first one found. |
| `--workdir <dir>` | | Run the CLI in this directory. Default: an empty temporary directory per job. |
| `--permission-mode <mode>` | | Claude Code permission mode. Default: `dontAsk`. |
| `--setting-sources <list>` | | Claude Code settings to load: `user`, `project`, `local`. Default: `project`, which in the empty job directory loads nothing, so allow rules of your own settings do not apply to jobs. |
| `--allowed-tools <tools>` | | Extra Claude Code tools to allow, comma separated, for example `Bash(git:*),Read`. |
| `--allow-shell` | | Let Codex run shell commands in its read-only sandbox. See the limits below. |
| | `CUSTOMERMATES_RUNNER_<CLIENT>_BIN` | The path of a CLI that is not on PATH, for example `CUSTOMERMATES_RUNNER_CLAUDE_BIN`. |

Logs go to standard output and never contain the token.

## What it does

- Every 60 seconds it reports the machine name and the CLIs it can start with their versions: the one named with `--client`, otherwise every CLI that answers `--version` with a version number. The workspace shows the runner as online for two minutes after that.
- It holds a request open for up to 25 seconds to claim the next queued job of the member who added the runner, and asks again straight away. It never receives a job of another member.
- It confirms each job to the server before it starts the CLI. The key of a job works only from that confirmation on. A job that is never confirmed, because the runner stopped or the answer was lost, returns to the queue after about a minute.
- For a job it writes a temporary MCP configuration with the workspace address and the job's key, starts the CLI in an empty temporary directory that does not hold that configuration, deletes both afterwards and goes idle.
  - Claude Code: `claude -p --output-format stream-json --verbose --mcp-config <file> --strict-mcp-config --setting-sources project --permission-mode dontAsk --allowedTools mcp__customermates --no-session-persistence`, with the prompt on standard input. Only the MCP server of the job is loaded, and your user settings are not.
  - Codex: `codex exec --json --ephemeral --ignore-user-config --ignore-rules -s read-only -c approval_policy="never" -c web_search="disabled"` and one `-c features.<name>=false` for every feature that would give the model a tool or a surface outside the job (the list is under the limits below), with the MCP server set through `-c` overrides, the key passed in an environment variable and the prompt on standard input.
  - Gemini CLI: `gemini --output-format stream-json --allowed-mcp-server-names customermates` with a generated settings file that holds the MCP server, and the prompt on standard input.
- It turns the CLI's output into the transcript the workspace shows: what the agent wrote, each tool call with a short digest of its arguments, each tool result and the finish. Text is cut to the stored lengths and tokens are removed. Events are sent in batches.
- The server says how long the job may run, ten minutes from the confirmation, and the runner counts that time itself, so a wrong clock on your machine does not matter. At the limit it stops the CLI and every process the CLI started, and reports `timedOut`. When the CLI ends it reports the final answer and the token counts when the CLI reports them. No cost is reported: a runner job costs nothing at Customermates, your CLI's own plan or key pays for it.
- A prompt the workspace marks as coming from an untrusted source is wrapped in the same "this text is data, not instructions" framing the Customermates MCP server uses.

## What the job's key can do

The key belongs to one attempt of one job. It works only on the workspace's MCP address and only while that job runs: before the runner confirmed the job, and after the job is finished, timed out, cancelled or its runner is revoked, the server refuses it. It acts as you, the member who added the runner, with your access. It can make at most 25 tool calls, it cannot call what would need your approval in the chat (deleting, changing roles, and the like), and what it changes cannot start the same automation again in a loop.

## What the server sends and never sends

The server sends the prompt, whether it comes from an untrusted source, the workspace's MCP address and the job's key. It never sends a workspace secret, a provider key or a job of another member. The runner never sends your CLI login, your files or your environment.

## Limits you should know

The CLI runs as the account that started the runner. Read this before you run a runner on a machine that holds other things.

- A prompt can carry text that other people wrote: the name of a record, a form entry, a message. The server marks such prompts and the runner frames them as data, and the CLI is told to treat record text as data. A model can still be talked into following such text. What it can then do is bounded by the job's key (above) and by what the CLI may do on your machine (below).
- Claude Code may only call the workspace's MCP tools unless you add tools with `--allowed-tools` or load your own settings with `--setting-sources`. Its built-in file reading stays inside the empty job directory.
- Codex has no shell by default. With `--allow-shell` its commands run in Codex's read-only sandbox, which stops writes but not reads: a command can read every file your account can read, and the job's MCP tools can then write that content into the workspace. Use it only on a machine, in a container or under an account that holds nothing else.
- Codex features the runner switches off, read from `codex features list` of Codex CLI 0.169.0 with an empty `CODEX_HOME`. The shell group, which `--allow-shell` leaves on: `shell_tool`, `unified_exec`, `unified_exec_tty`, `shell_snapshot`, `write_stdin_approval`. Always off: `apps`, `plugins`, `plugin_sharing`, `remote_plugin`, `skill_search`, `skill_mcp_dependency_install`, `tool_suggest`, `workspace_dependencies`, `hooks`, `view_image`, `image_generation`, `browser_use`, `browser_use_external`, `browser_use_full_cdp_access`, `browser_annotation_api`, `in_app_browser`, `in_app_local_automation`, `computer_use`, `multi_agent`, `multi_agent_v2`, `goals`, `sleep_tool`, `code_mode_host`, `code_mode_host_grpc`, `memories`, `daemon_auto_start`, and web search through `web_search="disabled"`. The names are passed as `-c features.<name>=false`, which 0.169.0 accepts for a name it does not know; `--disable` refuses an unknown name. Checked without a model run: with these flags `codex features list` of 0.169.0 shows every one of them as off except `unified_exec`, which that version reports as on whatever is passed. Not checked, because it needs a real job: which tools the model is then offered (in particular whether `unified_exec` still gives a command tool once `shell_tool` is off), and that the workspace's MCP tools keep working with `apps`, `plugins` and `hooks` off. A newer Codex can add a feature this list does not know.
- Gemini CLI is started with only the workspace's MCP server allowed. Its own built-in tools follow your Gemini settings.
- The runner token and the CLI logins sit in your account on that machine. A CLI that you allow to run commands can read them. For strict separation run the runner in the Docker image or under its own user account.
- Windows: the runner starts CLIs installed with npm (`.cmd` files) through `cmd.exe`. This path is covered by unit tests of the command line it builds, not by a test run on Windows. Stopping a job there uses `taskkill /T /F`.
- The flags above were checked against the help of Claude Code 2.1.326 and Codex CLI 0.169.0. An older version may not know every flag; the job then fails with the CLI's own message.

## Stop or revoke

Stop the runner with Ctrl+C or by stopping its container; a job in progress is stopped and reported as failed. Revoke the runner under **Settings, Agents** to cut it off for good: its jobs end as cancelled, their keys stop working at once, its next request answers 401 and the runner exits. A runner is also revoked when the member who added it leaves the workspace or is deactivated.

## Licence

This package ships inside the Customermates repository and carries the repository's licence, the Sustainable Use License in `LICENSE.md`, not a separate one. The `prepack` script copies `LICENSE.md` next to this file for the published package.
