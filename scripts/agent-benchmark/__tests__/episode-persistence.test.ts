import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EpisodeArtifact } from "../episode";

import { persist, persistAndCompleteEpisode } from "../episode";

describe("benchmark episode persistence", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((path) =>
        rm(path, { force: true, recursive: true }),
      ),
    );
  });

  it("atomically installs the artifact before making the ledger terminal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "episode.json");
    const artifact = {
      caseId: "S1",
      capturedAt: "2026-09-23T10:00:00.000Z",
    } as EpisodeArtifact;
    const query = vi.fn(async (_statement: string, _values: unknown[]) => {
      expect(JSON.parse(await readFile(artifactPath, "utf8"))).toEqual(
        artifact,
      );
      expect(await readdir(directory)).toEqual(["episode.json"]);
      return { rowCount: 1 };
    });

    await persistAndCompleteEpisode({
      pool: { query } as unknown as Pool,
      episodeId: "20000000-0000-4000-8000-000000000001",
      state: "scored",
      reason: null,
      artifactPath,
      artifact,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND state IN ('prepared', 'running')"),
      [
        "20000000-0000-4000-8000-000000000001",
        "scored",
        null,
        artifactPath,
      ],
    );
  });

  it("keeps the previous complete artifact when serialization fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-benchmark-"));
    temporaryDirectories.push(directory);
    const artifactPath = join(directory, "episode.json");
    const original = '{"complete":true}\n';
    await writeFile(artifactPath, original);
    const circular: { self?: unknown } = {};
    circular.self = circular;

    await expect(
      persist(artifactPath, circular as unknown as EpisodeArtifact),
    ).rejects.toThrow(/circular/i);

    expect(await readFile(artifactPath, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["episode.json"]);
  });
});
