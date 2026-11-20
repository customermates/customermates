export const RUNNER_DOCKER_IMAGE = "ghcr.io/customermates/runner";

export function runnerNpxCommand(url: string, token: string): string {
  return `CUSTOMERMATES_RUNNER_TOKEN=${token} npx customermates-runner --url ${url}`;
}

export function runnerDockerCommand(url: string, token: string): string {
  return [
    "docker run -d --restart unless-stopped",
    `-e CUSTOMERMATES_URL=${url}`,
    `-e CUSTOMERMATES_RUNNER_TOKEN=${token}`,
    '-v "$HOME/.claude:/home/node/.claude"',
    '-v "$HOME/.claude.json:/home/node/.claude.json"',
    RUNNER_DOCKER_IMAGE,
  ].join(" ");
}
