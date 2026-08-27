#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { createServer } from "node:net";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const POSTGRES_MAJOR = 17;
export const POSTGRES_IMAGE = `postgres:${POSTGRES_MAJOR}-alpine`;

const DATABASE_NAME = "customermates";
const DATABASE_PASSWORD = "postgres";
const DATABASE_USER = "postgres";
const DATA_DIRECTORY = "/var/lib/postgresql/data";
const PORT_MIN = 20_000;
const PORT_SPAN = 19_997;
const OWNER_LABEL = "com.customermates.dev-database";
const WORKTREE_LABEL = "com.customermates.worktree-id";
const MAJOR_LABEL = "com.customermates.postgres-major";
const PORT_LABEL = "com.customermates.host-port";
const SCHEMA_LABEL = "com.customermates.provisioner-schema";
const INVOCATION_LABEL = "com.customermates.provisioner-invocation";
const LABEL_SCHEMA = "1";
let validatedDockerEndpoint = null;

function fail(message) {
  throw new Error(message);
}

export function deriveWorktreeIdentity(directory) {
  const root = realpathSync(directory);
  const hash = createHash("sha256").update(root).digest("hex");
  const normalizedName = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^customermates-/, "");
  const slug = normalizedName.slice(0, 32).replace(/-+$/, "") || "worktree";
  const resourcePrefix = `customermates-${slug}-${hash}`;

  return {
    containerName: `${resourcePrefix}-db`,
    hash,
    preferredPort:
      PORT_MIN + (Number.parseInt(hash.slice(0, 8), 16) % PORT_SPAN),
    root,
    volumeName: `${resourcePrefix}-postgres-${POSTGRES_MAJOR}`,
  };
}

export function candidatePorts(hash, count = PORT_SPAN) {
  const offset = Number.parseInt(hash.slice(0, 8), 16) % PORT_SPAN;
  const step = 1 + (Number.parseInt(hash.slice(8, 16), 16) % (PORT_SPAN - 1));
  return Array.from(
    { length: Math.min(count, PORT_SPAN) },
    (_, index) => PORT_MIN + ((offset + index * step) % PORT_SPAN),
  );
}

export function assertLocalDockerEndpoint(endpoint) {
  if (!endpoint.startsWith("unix:///")) {
    fail(
      `Refusing Docker endpoint ${endpoint || "<empty>"}; development databases may only use a local Unix socket.`,
    );
  }
}

export function assertOwnedLabels(labels, worktreeId, resource) {
  if (
    labels?.[OWNER_LABEL] !== "true" ||
    labels?.[WORKTREE_LABEL] !== worktreeId
  ) {
    fail(
      `Refusing to modify ${resource}; it is not owned by this Customermates worktree.`,
    );
  }
}

export function parseArguments(arguments_) {
  const allowed = new Set(["--destroy", "--help", "--recreate"]);
  const unknown = arguments_.filter((argument) => !allowed.has(argument));
  if (unknown.length > 0) fail(`Unknown option: ${unknown.join(", ")}`);
  if (arguments_.includes("--destroy") && arguments_.includes("--recreate")) {
    fail("Use either --destroy or --recreate, not both.");
  }

  return {
    destroy: arguments_.includes("--destroy"),
    help: arguments_.includes("--help"),
    recreate: arguments_.includes("--recreate"),
  };
}

export function dockerCommandArguments(arguments_, endpoint) {
  return endpoint ? ["--host", endpoint, ...arguments_] : arguments_;
}

function runDocker(arguments_, { allowFailure = false } = {}) {
  const result = spawnSync(
    "docker",
    dockerCommandArguments(arguments_, validatedDockerEndpoint),
    { encoding: "utf8" },
  );
  if (result.error) fail(`Could not run Docker: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    fail(
      (
        result.stderr ||
        result.stdout ||
        `Docker exited with status ${result.status}`
      ).trim(),
    );
  }
  return result;
}

function inspectDockerResource(kind, name) {
  const result = runDocker([kind, "inspect", name], { allowFailure: true });
  if (result.status !== 0) {
    if (/no such (container|object|volume)/i.test(result.stderr)) return null;
    fail((result.stderr || result.stdout).trim());
  }

  const values = JSON.parse(result.stdout);
  if (!Array.isArray(values) || values.length !== 1)
    fail(`Docker returned an invalid inspection for ${kind} ${name}.`);
  return values[0];
}

function inspectContainer(name) {
  return inspectDockerResource("container", name);
}

function inspectVolume(name) {
  return inspectDockerResource("volume", name);
}

function resolveDockerEndpoint() {
  if (process.env.DOCKER_CONTEXT?.trim()) {
    const result = runDocker([
      "context",
      "inspect",
      process.env.DOCKER_CONTEXT.trim(),
      "--format",
      "{{.Endpoints.docker.Host}}",
    ]);
    return result.stdout.trim();
  }
  if (process.env.DOCKER_HOST?.trim()) return process.env.DOCKER_HOST.trim();
  const result = runDocker([
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  return result.stdout.trim();
}

function containerMount(container, volumeName) {
  return container.Mounts?.find(
    (mount) =>
      mount.Type === "volume" &&
      mount.Destination === DATA_DIRECTORY &&
      mount.Name === volumeName,
  );
}

export function containerPort(container) {
  const portBindings = container.HostConfig?.PortBindings ?? {};
  const publishedPorts = Object.entries(portBindings).filter(
    ([, bindings]) => Array.isArray(bindings) && bindings.length > 0,
  );
  const bindings = portBindings["5432/tcp"];
  if (publishedPorts.length !== 1) {
    fail(
      `Refusing container ${container.Name}; it has unexpected published ports.`,
    );
  }
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== "127.0.0.1"
  ) {
    fail(
      `Refusing container ${container.Name}; PostgreSQL is not bound exclusively to 127.0.0.1.`,
    );
  }

  const port = Number.parseInt(bindings[0].HostPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    fail(`Container ${container.Name} has an invalid host port.`);
  return port;
}

function validateContainerOwnership(container, identity) {
  assertOwnedLabels(
    container.Config?.Labels,
    identity.hash,
    `container ${identity.containerName}`,
  );
  if (!containerMount(container, identity.volumeName)) {
    fail(
      `Refusing container ${identity.containerName}; it does not mount the worktree's expected database volume.`,
    );
  }
}

function validateVolumeOwnership(volume, identity) {
  assertOwnedLabels(
    volume.Labels,
    identity.hash,
    `volume ${identity.volumeName}`,
  );
}

export function validateCurrentConfiguration(container, volume, identity) {
  validateContainerOwnership(container, identity);
  validateVolumeOwnership(volume, identity);

  const port = containerPort(container);
  const expected = {
    [MAJOR_LABEL]: String(POSTGRES_MAJOR),
    [PORT_LABEL]: String(port),
    [SCHEMA_LABEL]: LABEL_SCHEMA,
  };

  for (const [label, value] of Object.entries(expected)) {
    if (
      container.Config?.Labels?.[label] !== value ||
      volume.Labels?.[label] !== value
    ) {
      fail(
        `Database resources for this worktree have drifted. Run yarn db:provision --recreate to replace them explicitly.`,
      );
    }
  }
  if (container.Config?.Image !== POSTGRES_IMAGE) {
    fail(
      `Container ${identity.containerName} does not use ${POSTGRES_IMAGE}. Run yarn db:provision --recreate.`,
    );
  }
  const environment = new Set(container.Config?.Env ?? []);
  for (const value of [
    `POSTGRES_DB=${DATABASE_NAME}`,
    `POSTGRES_PASSWORD=${DATABASE_PASSWORD}`,
    `POSTGRES_USER=${DATABASE_USER}`,
  ]) {
    if (!environment.has(value)) {
      fail(
        `Container ${identity.containerName} has unexpected PostgreSQL settings. Run yarn db:provision --recreate.`,
      );
    }
  }
  return port;
}

function volumePort(volume, identity) {
  validateVolumeOwnership(volume, identity);
  if (
    volume.Labels?.[MAJOR_LABEL] !== String(POSTGRES_MAJOR) ||
    volume.Labels?.[SCHEMA_LABEL] !== LABEL_SCHEMA
  ) {
    fail(
      `Volume ${identity.volumeName} is from another PostgreSQL major. Run yarn db:provision --recreate to replace it explicitly.`,
    );
  }

  const port = Number.parseInt(volume.Labels?.[PORT_LABEL] ?? "", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    fail(`Volume ${identity.volumeName} has no valid host-port label.`);
  return port;
}

function labels(identity, port, invocationId = null) {
  const values = {
    [MAJOR_LABEL]: String(POSTGRES_MAJOR),
    [OWNER_LABEL]: "true",
    [PORT_LABEL]: String(port),
    [SCHEMA_LABEL]: LABEL_SCHEMA,
    [WORKTREE_LABEL]: identity.hash,
  };
  if (invocationId) values[INVOCATION_LABEL] = invocationId;
  return values;
}

function labelArguments(identity, port, invocationId = null) {
  return Object.entries(labels(identity, port, invocationId)).flatMap(
    ([name, value]) => ["--label", `${name}=${value}`],
  );
}

function removeOwnedResources(container, volume, identity) {
  if (container) {
    validateContainerOwnership(container, identity);
    runDocker(["container", "rm", "--force", identity.containerName]);
  }
  if (volume) {
    validateVolumeOwnership(volume, identity);
    runDocker(["volume", "rm", identity.volumeName]);
  }
}

function createOwnedVolume(identity, port) {
  runDocker([
    "volume",
    "create",
    ...labelArguments(identity, port),
    identity.volumeName,
  ]);
  const volume = inspectVolume(identity.volumeName);
  if (!volume) fail(`Docker did not create volume ${identity.volumeName}.`);
  validateVolumeOwnership(volume, identity);
  return volume;
}

function startNewContainer(identity, port, invocationId) {
  return runDocker(
    [
      "run",
      "--detach",
      "--name",
      identity.containerName,
      ...labelArguments(identity, port, invocationId),
      "--env",
      `POSTGRES_DB=${DATABASE_NAME}`,
      "--env",
      `POSTGRES_PASSWORD=${DATABASE_PASSWORD}`,
      "--env",
      `POSTGRES_USER=${DATABASE_USER}`,
      "--publish",
      `127.0.0.1:${port}:5432`,
      "--mount",
      `type=volume,source=${identity.volumeName},target=${DATA_DIRECTORY}`,
      "--health-cmd",
      `pg_isready -U ${DATABASE_USER} -d ${DATABASE_NAME}`,
      "--health-interval",
      "1s",
      "--health-timeout",
      "5s",
      "--health-retries",
      "30",
      POSTGRES_IMAGE,
    ],
    { allowFailure: true },
  );
}

function isPortAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveAvailability(false));
    server.listen({ exclusive: true, host: "127.0.0.1", port }, () => {
      server.close(() => resolveAvailability(true));
    });
  });
}

function reservedDockerPorts(identity) {
  const ports = new Set();
  const containerIds = runDocker(["container", "ls", "--all", "--quiet"])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  for (const containerId of containerIds) {
    const container = inspectContainer(containerId);
    for (const bindings of Object.values(
      container?.HostConfig?.PortBindings ?? {},
    )) {
      if (!Array.isArray(bindings)) continue;
      for (const binding of bindings) {
        const port = Number.parseInt(binding.HostPort, 10);
        if (Number.isInteger(port)) ports.add(port);
      }
    }
  }

  const volumeNames = runDocker([
    "volume",
    "ls",
    "--quiet",
    "--filter",
    `label=${OWNER_LABEL}=true`,
  ])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  for (const volumeName of volumeNames) {
    if (volumeName === identity.volumeName) continue;
    const volume = inspectVolume(volumeName);
    const port = Number.parseInt(volume?.Labels?.[PORT_LABEL] ?? "", 10);
    if (Number.isInteger(port)) ports.add(port);
  }
  return ports;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitUntilHealthy(identity) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const container = inspectContainer(identity.containerName);
    const health = container?.State?.Health?.Status;
    if (health === "healthy") return;
    if (health === "unhealthy" || container?.State?.Status === "exited") break;
    await delay(1_000);
  }

  const logs = runDocker(
    ["container", "logs", "--tail", "30", identity.containerName],
    { allowFailure: true },
  );
  fail(
    `PostgreSQL did not become healthy.\n${(logs.stderr || logs.stdout).trim()}`,
  );
}

function printConnection(identity, port) {
  const url = buildDatabaseUrl(port);
  console.log(
    `PostgreSQL ${POSTGRES_MAJOR} is ready for worktree ${basename(identity.root)}.`,
  );
  console.log(`Container: ${identity.containerName}`);
  console.log(`Volume: ${identity.volumeName}`);
  console.log("");
  console.log(`DATABASE_URL=\"${url}\"`);
  console.log(`DIRECT_URL=\"${url}\"`);
}

export function buildDatabaseUrl(port) {
  return `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@127.0.0.1:${port}/${DATABASE_NAME}`;
}

function isPortConflict(result) {
  return /address already in use|bind.+failed|port is already allocated/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
}

export function createdByInvocation(container, invocationId) {
  return container?.Config?.Labels?.[INVOCATION_LABEL] === invocationId;
}

async function startOrJoinContainer(identity, port, invocationId) {
  const result = startNewContainer(identity, port, invocationId);
  if (result.status === 0) {
    await waitUntilHealthy(identity);
    return port;
  }

  const presentContainer = inspectContainer(identity.containerName);
  if (
    presentContainer &&
    !createdByInvocation(presentContainer, invocationId)
  ) {
    const presentVolume = inspectVolume(identity.volumeName);
    if (!presentVolume)
      fail(
        `Container ${identity.containerName} appeared without its expected volume.`,
      );
    const presentPort = validateCurrentConfiguration(
      presentContainer,
      presentVolume,
      identity,
    );
    await waitUntilHealthy(identity);
    return presentPort;
  }

  if (presentContainer) {
    validateContainerOwnership(presentContainer, identity);
    runDocker(["container", "rm", "--force", identity.containerName]);
  }
  const failure = (result.stderr || result.stdout).trim();
  if (isPortConflict(result)) {
    fail(
      `Host port ${port} became busy while Docker started. The owned volume was kept; free the port or run yarn db:provision --recreate explicitly.\n${failure}`,
    );
  }
  fail(failure);
}

async function createDatabase(identity, existingVolume = null) {
  const reservedPorts = reservedDockerPorts(identity);
  const invocationId = randomUUID();
  if (existingVolume) {
    const port = volumePort(existingVolume, identity);
    if (reservedPorts.has(port) || !(await isPortAvailable(port))) {
      const concurrentContainer = inspectContainer(identity.containerName);
      if (concurrentContainer) {
        const concurrentPort = validateCurrentConfiguration(
          concurrentContainer,
          existingVolume,
          identity,
        );
        await waitUntilHealthy(identity);
        return concurrentPort;
      }
      fail(
        `Host port ${port} belongs to this worktree's volume but is currently busy. Free it and rerun; the volume was not changed.`,
      );
    }
    return startOrJoinContainer(identity, port, invocationId);
  }

  for (const port of candidatePorts(identity.hash)) {
    if (reservedPorts.has(port) || !(await isPortAvailable(port))) continue;
    createOwnedVolume(identity, port);
    return startOrJoinContainer(identity, port, invocationId);
  }

  fail(
    `No free loopback port was available in ${PORT_MIN}-${PORT_MIN + PORT_SPAN - 1}.`,
  );
}

async function provision({ destroy, recreate }) {
  validatedDockerEndpoint = null;
  const dockerEndpoint = resolveDockerEndpoint();
  assertLocalDockerEndpoint(dockerEndpoint);
  validatedDockerEndpoint = dockerEndpoint;
  const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (rootResult.error || rootResult.status !== 0)
    fail("Run this command from a Git worktree.");

  const identity = deriveWorktreeIdentity(rootResult.stdout.trim());
  let container = inspectContainer(identity.containerName);
  let volume = inspectVolume(identity.volumeName);

  if (container) validateContainerOwnership(container, identity);
  if (volume) validateVolumeOwnership(volume, identity);
  if (container && !volume)
    fail(
      `Container ${identity.containerName} is missing its owned volume; refusing to continue.`,
    );

  if (destroy) {
    if (!container && !volume) {
      console.log(
        `No owned database resources exist for worktree ${basename(identity.root)}.`,
      );
      return;
    }
    console.log(
      `Destroying the explicitly selected local database for worktree ${basename(identity.root)}.`,
    );
    removeOwnedResources(container, volume, identity);
    console.log("Owned container and volume removed.");
    return;
  }

  if (recreate && (container || volume)) {
    console.log(
      "Recreating this database removes all local data; PostgreSQL major versions cannot share data directories.",
    );
    removeOwnedResources(container, volume, identity);
    container = null;
    volume = null;
  }

  if (container) {
    const port = validateCurrentConfiguration(container, volume, identity);
    if (!container.State?.Running)
      runDocker(["container", "start", identity.containerName]);
    await waitUntilHealthy(identity);
    printConnection(identity, port);
    return;
  }

  const port = await createDatabase(identity, volume);
  container = inspectContainer(identity.containerName);
  volume = inspectVolume(identity.volumeName);
  if (!container || !volume)
    fail("Docker lost the database resources after startup.");
  validateCurrentConfiguration(container, volume, identity);
  printConnection(identity, port);
}

function printHelp() {
  console.log(`Usage: yarn db:provision [--recreate | --destroy]

Creates or starts this worktree's PostgreSQL ${POSTGRES_MAJOR} container and prints its local connection URL.

  --recreate  Explicitly remove the owned container and volume before provisioning
  --destroy   Explicitly remove the owned container and volume, then exit
  --help      Show this help`);
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    printHelp();
    return;
  }
  await provision(options);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      `Database provisioning failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
