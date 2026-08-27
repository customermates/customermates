import { isAbsolute, relative, resolve, sep } from "node:path";

export function isPathInside(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target));
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}
