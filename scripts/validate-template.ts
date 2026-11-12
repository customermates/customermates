import { buildTemplateBundle, templateSlugsOnDisk } from "./lib/template-sources";

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const slugs = requested.length ? requested : templateSlugsOnDisk();
let failed = 0;

for (const slug of slugs) {
  try {
    const bundle = buildTemplateBundle(slug);
    console.log(`ok ${slug}: ${Object.keys(bundle.text).join(" ")}`);
  } catch (error) {
    failed += 1;
    console.error(`FAILED ${slug}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failed ? 1 : 0);
