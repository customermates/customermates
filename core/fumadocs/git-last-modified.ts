import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type RepositoryHistory = { root: string; shallowCommits: Set<string>; committedFiles: Set<string> };

async function readRepositoryHistory(cwd: string): Promise<RepositoryHistory | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel", "--git-path", "shallow"], { cwd });
    const [root, shallowPath] = stdout.trim().split("\n");

    if (!root || !shallowPath) return null;

    const { stdout: files } = await execFileAsync("git", ["ls-tree", "-r", "-z", "--name-only", "HEAD"], {
      cwd: root,
    });

    let shallow = "";

    try {
      shallow = await readFile(path.resolve(cwd, shallowPath), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
    }

    return {
      root,
      shallowCommits: new Set(shallow.split(/\s+/).filter(Boolean)),
      committedFiles: new Set(files.split("\0").filter(Boolean)),
    };
  } catch {
    return null;
  }
}

export function createGitLastModifiedResolver(cwd = process.cwd()): (filePath: string) => Promise<Date | null> {
  let repositoryHistory: Promise<RepositoryHistory | null> | undefined;

  return async (filePath) => {
    repositoryHistory ??= readRepositoryHistory(cwd);
    const repository = await repositoryHistory;

    if (!repository) return null;

    try {
      const absolutePath = await realpath(path.resolve(cwd, filePath));
      const relativePath = path.relative(repository.root, absolutePath);

      if (
        !relativePath ||
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      )
        return null;

      if (!repository.committedFiles.has(relativePath.split(path.sep).join("/"))) return null;

      const { stdout } = await execFileAsync(
        "git",
        ["--literal-pathspecs", "log", "-1", "--format=%H%n%aI", "--", relativePath],
        { cwd: repository.root },
      );
      const [commit, timestamp] = stdout.trim().split("\n");

      if (!commit || !timestamp || repository.shallowCommits.has(commit)) return null;

      const date = new Date(timestamp);

      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };
}
