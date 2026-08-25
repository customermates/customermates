import fs from 'node:fs'
import path from 'node:path'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import { toString as S } from 'mdast-util-to-string'
function walk(d,out=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory())walk(p,out); else if(e.name.endsWith('.mdx'))out.push(p)}return out}
const proc = remark().use(remarkGfm).use(remarkMdx)
const FAQ = /(Fragen|[Qq]uestions|FAQ)/
const files = walk('content')
let nFiles=0,h3q=0,boldq=0,boldNonQ=0,plainPara=0
const shape={h3:0,bold:0,both:0,neither:0}
for (const f of files){
  const raw = fs.readFileSync(f,'utf8').replace(/^---\n[\s\S]*?\n---\n/,'')
  let tree; try{tree=proc.parse(raw)}catch{continue}
  const kids=tree.children
  const idxs=kids.map((n,i)=>[n,i]).filter(([n])=>n.type==='heading'&&n.depth===2&&FAQ.test(S(n))).map(([,i])=>i)
  if(!idxs.length) continue
  nFiles++
  let h3=0,bold=0
  for(const s of idxs){
    let e=kids.length
    for(let i=s+1;i<kids.length;i++) if(kids[i].type==='heading'&&kids[i].depth<=2){e=i;break}
    for(const n of kids.slice(s+1,e)){
      if(n.type==='heading'&&n.depth===3){ if(S(n).trim().endsWith('?')) h3++; }
      else if(n.type==='paragraph'&&n.children[0]?.type==='strong'){
        const t=S(n.children[0]).trim()
        if(t.endsWith('?')) bold++; else boldNonQ++
      } else if(n.type==='paragraph') plainPara++
    }
  }
  h3q+=h3; boldq+=bold
  if(h3&&bold)shape.both++; else if(h3)shape.h3++; else if(bold)shape.bold++; else shape.neither++
}
console.log('files',nFiles,'shape',shape)
console.log('h3 questions ending in ?',h3q,'| bold-lead questions ending in ?',boldq,'| bold-lead NOT a question',boldNonQ,'| plain paragraphs in FAQ sections',plainPara)
