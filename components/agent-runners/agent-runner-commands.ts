export const RUNNER_DOCKER_IMAGE = "ghcr.io/customermates/runner";

export function runnerNpxCommand(url: string, token: string): string {
  return `npx customermates-runner --token ${token} --url ${url}`;
}

export function runnerDockerCommand(url: string, token: string): string {
  return [
    "docker run -d --restart unless-stopped",
    `-e CUSTOMERMATES_URL=${url}`,
    `-e CUSTOMERMATES_RUNNER_TOKEN=${token}`,
    '-v "$HOME/.claude:/home/node/.claude"',
    RUNNER_DOCKER_IMAGE,
  ].join(" ");
}
