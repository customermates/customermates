import { compile } from '@mdx-js/mdx'
const src = `## Häufig gestellte Fragen

### Frage eins?

Antwort eins mit [einem Link](/de/preise).

### Frage zwei?

Antwort zwei.
`
const out = await compile(src, { outputFormat: 'function-body', development: false })
console.log(String(out))
