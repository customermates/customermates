import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

copyFileSync(join(packageRoot, "..", "..", "LICENSE.md"), join(packageRoot, "LICENSE.md"));
execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: packageRoot, stdio: "inherit" });
