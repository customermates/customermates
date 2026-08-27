import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  POSTGRES_IMAGE,
  assertLocalDockerEndpoint,
  assertOwnedLabels,
  buildDatabaseUrl,
  candidatePorts,
  createdByInvocation,
  deriveWorktreeIdentity,
  dockerCommandArguments,
  parseArguments,
  validateCurrentConfiguration,
} from "../provision-dev-database.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

function makeDirectory(name: string) {
  const parent = mkdtempSync(
    join(tmpdir(), "customermates-db-provisioner-test-"),
  );
  temporaryDirectories.push(parent);
  const directory = join(parent, name);
  mkdirSync(directory);
  return directory;
}

function resources(
  directory: string,
  overrides: {
    container?: Record<string, unknown>;
    labels?: Record<string, string>;
  } = {},
) {
  const identity = deriveWorktreeIdentity(directory);
  const port = identity.preferredPort;
  const labels: Record<string, string> = {
    "com.customermates.dev-database": "true",
    "com.customermates.host-port": String(port),
    "com.customermates.postgres-major": "17",
    "com.customermates.provisioner-schema": "1",
    "com.customermates.worktree-id": identity.hash,
    ...overrides.labels,
  };
  const container = {
    Config: {
      Env: [
        "POSTGRES_DB=customermates",
        "POSTGRES_PASSWORD=postgres",
        "POSTGRES_USER=postgres",
      ],
      Image: POSTGRES_IMAGE,
      Labels: labels,
    },
    HostConfig: {
      PortBindings: {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: String(port) }],
      },
    },
    Mounts: [
      {
        Destination: "/var/lib/postgresql/data",
        Name: identity.volumeName,
        Type: "volume",
      },
    ],
    Name: `/${identity.containerName}`,
    ...overrides.container,
  };
  return { container, identity, labels, port, volume: { Labels: labels } };
}

describe("development database provisioning", () => {
  it("derives stable identities and distinct resources from canonical worktree paths", () => {
    const first = makeDirectory(
      "customermates-first-worktree-with-a-long-name",
    );
    const alias = join(first, "..", "first-worktree-alias");
    symlinkSync(first, alias);
    const second = makeDirectory("second-worktree");

    expect(deriveWorktreeIdentity(alias)).toEqual(
      deriveWorktreeIdentity(first),
    );
    expect(deriveWorktreeIdentity(first).containerName).not.toContain(
      "customermates-customermates",
    );
    expect(deriveWorktreeIdentity(first).containerName).not.toContain("--");
    expect(deriveWorktreeIdentity(second).hash).not.toBe(
      deriveWorktreeIdentity(first).hash,
    );
    expect(deriveWorktreeIdentity(second).containerName).not.toBe(
      deriveWorktreeIdentity(first).containerName,
    );
  });

  it("produces deterministic unique candidate ports in the loopback development range", () => {
    const { hash, preferredPort } = deriveWorktreeIdentity(
      makeDirectory("ports"),
    );
    const first = candidatePorts(hash, 1_000);

    expect(first).toEqual(candidatePorts(hash, 1_000));
    expect(first[0]).toBe(preferredPort);
    expect(new Set(first)).toHaveLength(first.length);
    expect(first.every((port) => port >= 20_000 && port <= 39_996)).toBe(true);
  });

  it("accepts only a local Unix-socket Docker endpoint", () => {
    expect(() =>
      assertLocalDockerEndpoint("unix:///var/run/docker.sock"),
    ).not.toThrow();
    expect(() => assertLocalDockerEndpoint("tcp://127.0.0.1:2375")).toThrow(
      "local Unix socket",
    );
    expect(() => assertLocalDockerEndpoint("ssh://docker.example.com")).toThrow(
      "local Unix socket",
    );
  });

  it("pins resource commands to the validated Docker endpoint", () => {
    expect(
      dockerCommandArguments(
        ["container", "ls"],
        "unix:///Users/test/.docker/run/docker.sock",
      ),
    ).toEqual([
      "--host",
      "unix:///Users/test/.docker/run/docker.sock",
      "container",
      "ls",
    ]);
  });

  it("refuses resources without this worktree's ownership labels", () => {
    const { identity, labels } = resources(makeDirectory("ownership"));

    expect(() =>
      assertOwnedLabels(labels, identity.hash, "test volume"),
    ).not.toThrow();
    expect(() => assertOwnedLabels({}, identity.hash, "test volume")).toThrow(
      "not owned",
    );
    expect(() =>
      assertOwnedLabels(labels, "another-worktree", "test volume"),
    ).toThrow("not owned");
  });

  it("distinguishes containers created by concurrent invocations", () => {
    const current = resources(makeDirectory("concurrent"));
    current.container.Config.Labels[
      "com.customermates.provisioner-invocation"
    ] = "first";

    expect(createdByInvocation(current.container, "first")).toBe(true);
    expect(createdByInvocation(current.container, "second")).toBe(false);
  });

  it("validates the image, volume, major, and loopback-only published port", () => {
    const current = resources(makeDirectory("current"));
    expect(
      validateCurrentConfiguration(
        current.container,
        current.volume,
        current.identity,
      ),
    ).toBe(current.port);

    const oldMajor = resources(makeDirectory("old-major"), {
      labels: { "com.customermates.postgres-major": "16" },
    });
    expect(() =>
      validateCurrentConfiguration(
        oldMajor.container,
        oldMajor.volume,
        oldMajor.identity,
      ),
    ).toThrow("--recreate");

    const exposed = resources(makeDirectory("exposed"));
    exposed.container.HostConfig.PortBindings["5432/tcp"][0].HostIp = "0.0.0.0";
    expect(() =>
      validateCurrentConfiguration(
        exposed.container,
        exposed.volume,
        exposed.identity,
      ),
    ).toThrow("127.0.0.1");

    const wrongVolume = resources(makeDirectory("wrong-volume"));
    wrongVolume.container.Mounts[0].Name = "foreign-volume";
    expect(() =>
      validateCurrentConfiguration(
        wrongVolume.container,
        wrongVolume.volume,
        wrongVolume.identity,
      ),
    ).toThrow("expected database volume");
  });

  it("parses explicit destructive options and rejects ambiguous input", () => {
    expect(parseArguments([])).toEqual({
      destroy: false,
      help: false,
      recreate: false,
    });
    expect(parseArguments(["--recreate"])).toEqual({
      destroy: false,
      help: false,
      recreate: true,
    });
    expect(parseArguments(["--destroy"])).toEqual({
      destroy: true,
      help: false,
      recreate: false,
    });
    expect(() => parseArguments(["--recreate", "--destroy"])).toThrow("either");
    expect(() => parseArguments(["--force"])).toThrow("Unknown option");
  });

  it("prints an exact local URL for .env", () => {
    expect(buildDatabaseUrl(24_321)).toBe(
      "postgresql://postgres:postgres@127.0.0.1:24321/customermates",
    );
  });
});
