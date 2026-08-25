import fs from 'node:fs'
import path from 'node:path'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

import remarkMdx from 'remark-mdx'
import { toString as mdToString } from 'mdast-util-to-string'

function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) walk(p,out); else if (e.name.endsWith('.mdx')) out.push(p) } return out }
const proc = remark().use(remarkGfm).use(remarkMdx)
const FAQ = /(Häufig|Häufige|Frequently|FAQ|Common .*questions)/i
const files = walk('content')
let filesWithFaqH2=0, h3shaped=0, boldshaped=0, both=0, neither=0, h3q=0, boldq=0, withLink=0, withList=0
const perDir={}
const oddities=[]
for (const f of files) {
  let tree
  try { tree = proc.parse(fs.readFileSync(f,'utf8').replace(/^---\n[\s\S]*?\n---\n/,'')) } catch (e) { oddities.push([f,'PARSE FAIL',String(e).slice(0,80)]); continue }
  const kids = tree.children
  const idxs = kids.map((n,i)=>[n,i]).filter(([n])=>n.type==='heading'&&n.depth===2&&FAQ.test(mdToString(n))).map(([,i])=>i)
  if (!idxs.length) continue
  filesWithFaqH2++
  const dir=f.split('/')[1]; perDir[dir]??={h3:0,bold:0,both:0,neither:0}
  let h3=0,bold=0,link=false,list=false
  for (const s of idxs) {
    let e=kids.length
    for (let i=s+1;i<kids.length;i++) if (kids[i].type==='heading'&&kids[i].depth<=2) { e=i; break }
    for (const n of kids.slice(s+1,e)) {
      if (n.type==='heading'&&n.depth===3) h3++
      if (n.type==='paragraph'&&n.children[0]?.type==='strong') bold++
      if (n.type==='list') list=true
      JSON.stringify(n).includes('"link"') && (link=true)
    }
  }
  h3q+=h3; boldq+=bold
  if (link) withLink++
  if (list) withList++
  if (h3>0&&bold>0) { both++; perDir[dir].both++; oddities.push([f,'BOTH',h3,bold]) }
  else if (h3>0) { h3shaped++; perDir[dir].h3++ }
  else if (bold>0) { boldshaped++; perDir[dir].bold++ }
  else { neither++; perDir[dir].neither++; oddities.push([f,'NEITHER']) }
}
console.log({filesWithFaqH2,h3shaped,boldshaped,both,neither})
console.log('h3 questions',h3q,'bold-lead paragraphs',boldq)
console.log('sections containing a link:',withLink,'containing a list:',withList)
console.log(JSON.stringify(perDir))
console.log('oddities:',oddities.slice(0,25))
