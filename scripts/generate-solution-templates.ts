import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { solutionTemplatesFromSeeds } from "@/prisma/seeds/solutions/solution-templates-source";

const target = join(process.cwd(), "core", "solutions", "solution-templates.json");
writeFileSync(target, `${JSON.stringify(solutionTemplatesFromSeeds(), null, 2)}\n`);
console.log(`Wrote ${target}`);
