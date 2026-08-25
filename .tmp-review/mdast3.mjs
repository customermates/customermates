import fs from 'node:fs'; import path from 'node:path'
import { remark } from 'remark'; import remarkGfm from 'remark-gfm'; import remarkMdx from 'remark-mdx'
import { toString as S } from 'mdast-util-to-string'
function walk(d,out=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory())walk(p,out); else if(e.name.endsWith('.mdx'))out.push(p)}return out}
const proc=remark().use(remarkGfm).use(remarkMdx)
const FAQ=/(Fragen|[Qq]uestions|FAQ)/
const FP=[/Step 7/,/Schritt 7/,/Qualification questions that actually work/,/12-Fragen-Prüfliste/]
let allH3=0, filesMulti=0, fpOnly=[], mixed=[]
for(const f of walk('content')){
  const raw=fs.readFileSync(f,'utf8').replace(/^---\n[\s\S]*?\n---\n/,'')
  let t; try{t=proc.parse(raw)}catch{continue}
  const k=t.children
  const hits=k.map((n,i)=>[n,i]).filter(([n])=>n.type==='heading'&&n.depth===2&&FAQ.test(S(n)))
  if(!hits.length) continue
  if(hits.length>1) filesMulti++
  const isFp=(n)=>FP.some(r=>r.test(S(n)))
  if(hits.every(([n])=>isFp(n))) fpOnly.push([f,hits.map(([n])=>S(n))])
  else if(hits.some(([n])=>isFp(n))) mixed.push([f,hits.map(([n])=>S(n))])
  for(const [,s] of hits){
    let e=k.length
    for(let i=s+1;i<k.length;i++) if(k[i].type==='heading'&&k[i].depth<=2){e=i;break}
    for(const n of k.slice(s+1,e)) if(n.type==='heading'&&n.depth===3) allH3++
  }
}
console.log('ALL h3 headings inside matched sections:',allH3)
console.log('files with >1 matching h2:',filesMulti)
console.log('FALSE-POSITIVE-ONLY files:',fpOnly.length, fpOnly)
console.log('MIXED files:',mixed.length, mixed)
