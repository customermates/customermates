#!/usr/bin/env tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { buildCompositionHtml, verifyProductAuthority } from "./render";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${name}`);
  return args[index + 1];
};

const spec = resolve(value("--spec"));
const output = resolve(value("--output"));
const expectedRef = value("--expected-ref");
const roots: Record<string, string> = { product: process.cwd() };

for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== "--asset-root") continue;
  const assignment = args[index + 1];
  if (!assignment?.includes("=")) throw new Error("--asset-root requires id=path");
  const [id, ...pathParts] = assignment.split("=");
  roots[id] = resolve(pathParts.join("="));
}

const input = JSON.parse(readFileSync(spec, "utf8"));
if (input?.meta?.productRef !== expectedRef) throw new Error("composition productRef must equal --expected-ref");
verifyProductAuthority(process.cwd(), expectedRef);
const html = await buildCompositionHtml(input, roots);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html);
process.stdout.write(`${JSON.stringify({ output, productRef: expectedRef, bytes: Buffer.byteLength(html) })}\n`);
