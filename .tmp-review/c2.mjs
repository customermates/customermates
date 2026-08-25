import { compile, run } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import React from 'react'
const src = `## Häufig gestellte Fragen

### Frage eins?

Antwort eins.

### Frage zwei?

Antwort zwei.
`
const compiled = await compile(src, { outputFormat: 'function-body', development: false })
const mod = await run(compiled, { ...runtime, baseUrl: import.meta.url })
const MDXContent = mod.default

function Wrapper({ children }) {
  console.log('wrapper children type name:', typeof children?.type, children?.type?.name)
  const inner = children.type(children.props)
  const arr = React.Children.toArray(inner.props.children)
  console.log('inner is Fragment:', inner.type === React.Fragment)
  console.log('block children count:', arr.length)
  console.log('block kinds:', arr.map(c => typeof c === 'string' ? JSON.stringify(c) : (typeof c.type === 'string' ? c.type : c.type?.name ?? '?')).join(','))
  return null
}
// render
const { renderToStaticMarkup } = await import('react-dom/server')
renderToStaticMarkup(React.createElement(MDXContent, { components: { wrapper: Wrapper } }))
