import fs from 'node:fs'
import path from 'node:path'
function walk(d, out=[]) { for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) walk(p,out); else if (e.name.endsWith('.mdx')) out.push(p) } return out }
const files = walk('content')
const FAQ_H2 = /^##[ \t]+.*(Fragen|[Qq]uestions|FAQ)/
let h3shaped=0, boldshaped=0, both=0, neither=0
let h3q=0, boldq=0
const perDir={}
const neitherFiles=[], bothFiles=[]
let withLink=0, withList=0
for (const f of files) {
  const raw = fs.readFileSync(f,'utf8')
  const lines = raw.split('\n')
  let start=-1
  for (let i=0;i<lines.length;i++) if (FAQ_H2.test(lines[i])) { start=i; break }
  if (start<0) continue
  let end=lines.length
  for (let i=start+1;i<lines.length;i++) if (/^##[ \t]/.test(lines[i]) && !/^###/.test(lines[i])) { end=i; break }
  const sec = lines.slice(start+1,end)
  const h3 = sec.filter(l=>/^###[ \t]+/.test(l)).length
  const bold = sec.filter(l=>/^\*\*.+\*\*\s*$/.test(l)).length
  h3q+=h3; boldq+=bold
  const dir = f.split('/')[1]
  perDir[dir] ??= {h3:0,bold:0,both:0,neither:0}
  if (h3>0 && bold>0) { both++; bothFiles.push([f,h3,bold]); perDir[dir].both++ }
  else if (h3>0) { h3shaped++; perDir[dir].h3++ }
  else if (bold>0) { boldshaped++; perDir[dir].bold++ }
  else { neither++; neitherFiles.push(f); perDir[dir].neither++ }
  const body = sec.join('\n')
  if (/\[[^\]]+\]\([^)]+\)/.test(body)) withLink++
  if (/^\s*[-*]\s+/m.test(body) || /^\s*\d+\.\s+/m.test(body)) withList++
}
console.log('files with FAQ h2:', files.filter(f=>fs.readFileSync(f,'utf8').split('\n').some(l=>FAQ_H2.test(l))).length)
console.log({h3shaped, boldshaped, both, neither})
console.log('questions: h3', h3q, 'bold', boldq)
console.log('perDir', JSON.stringify(perDir,null,1))
console.log('sections with a markdown link:', withLink, ' with a list:', withList)
console.log('BOTH-shaped files (first 10):', bothFiles.slice(0,10))
console.log('NEITHER-shaped files (first 10):', neitherFiles.slice(0,10))
