import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as Acc from '@radix-ui/react-accordion'
const h = React.createElement
const item = (id, q, a) => h(Acc.Item, { key: id, value: id },
  h(Acc.Header, null, h(Acc.Trigger, null, q)),
  h(Acc.Content, null, h('p', null, a)))
const tree = h(Acc.Root, { type: 'single', collapsible: true, defaultValue: 'q1' },
  item('q1','Frage eins?','ANSWER-ONE-TEXT'),
  item('q2','Frage zwei?','ANSWER-TWO-TEXT'),
  item('q3','Frage drei?','ANSWER-THREE-TEXT'))
const html = renderToStaticMarkup(tree)
console.log(html)
console.log('\n--- ANSWER-ONE in HTML:', html.includes('ANSWER-ONE-TEXT'))
console.log('--- ANSWER-TWO in HTML:', html.includes('ANSWER-TWO-TEXT'))
console.log('--- ANSWER-THREE in HTML:', html.includes('ANSWER-THREE-TEXT'))
const html2 = renderToStaticMarkup(h(Acc.Root, { type: 'multiple' },
  item('q1','Frage eins?','ANSWER-ONE-TEXT'), item('q2','Frage zwei?','ANSWER-TWO-TEXT')))
console.log('--- type=multiple, no defaultValue: ANSWER-ONE in HTML:', html2.includes('ANSWER-ONE-TEXT'))
