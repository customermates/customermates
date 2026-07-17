import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import tailwindPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppChip } from "@/components/chip/app-chip";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { compositionSchema, type Composition, type CompositionNode } from "./schema";

type AssetRoots = Record<string, string>;
type AssetMap = Record<string, { dataUri: string }>;

const htmlEscape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const assertWithinRoot = (root: string, candidate: string) => {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error(`asset escapes root: ${candidate}`);
  return resolvedCandidate;
};

const loadAssets = (composition: Composition, roots: AssetRoots): AssetMap =>
  Object.fromEntries(
    Object.entries(composition.assets).map(([assetId, asset]) => {
      const root = roots[asset.root];
      if (!root) throw new Error(`missing asset root: ${asset.root}`);
      const file = assertWithinRoot(root, asset.path);
      const bytes = readFileSync(file);
      return [assetId, { dataUri: `data:${asset.mediaType};base64,${bytes.toString("base64")}` }];
    }),
  );

const layoutStyle = (layout: CompositionNode["layout"]): React.CSSProperties => {
  if (!layout) return {};
  const style: React.CSSProperties = {};
  if (layout.x != null || layout.y != null || layout.width != null || layout.height != null)
    style.position = "absolute";
  if (layout.attach) style.position = "absolute";
  if (layout.x != null) style.left = layout.x;
  if (layout.y != null) style.top = layout.y;
  if (layout.width != null) style.width = layout.width;
  if (layout.height != null) style.height = layout.height;
  if (layout.z != null) style.zIndex = layout.z;
  if (layout.display) style.display = layout.display;
  if (layout.direction) style.flexDirection = layout.direction;
  if (layout.gap != null) style.gap = layout.gap;
  if (layout.align)
    style.alignItems = layout.align === "start" ? "flex-start" : layout.align === "end" ? "flex-end" : layout.align;
  if (layout.justify) {
    style.justifyContent =
      layout.justify === "between"
        ? "space-between"
        : layout.justify === "start"
          ? "flex-start"
          : layout.justify === "end"
            ? "flex-end"
            : layout.justify;
  }

  if (layout.columns) style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
  if (layout.textAlign) style.textAlign = layout.textAlign;
  if (layout.padding != null) style.padding = layout.padding;
  return style;
};

const wrapper = (node: CompositionNode, content: React.ReactNode) => (
  <div
    data-cm-alignment={node.qa?.alignment}
    data-cm-alignment-group={node.qa?.alignmentGroup}
    data-cm-allow-overlap={node.qa?.allowOverlapWith?.join(",")}
    data-cm-attach={node.layout?.attach ? JSON.stringify(node.layout.attach) : undefined}
    data-cm-check-padding={node.qa?.checkPadding ? "true" : undefined}
    data-cm-component={node.type}
    data-cm-critical={node.qa?.critical ? "true" : undefined}
    data-cm-id={node.id}
    data-cm-min-phone-px={node.qa?.minPhonePx}
    data-cm-qa-box={node.qa ? "true" : undefined}
    data-motion-id={node.id}
    style={layoutStyle(node.layout)}
  >
    {content}
  </div>
);

const assetImage = (assets: AssetMap, asset: string, label: string) => {
  const value = assets[asset];
  if (!value) throw new Error(`unknown asset: ${asset}`);
  return React.createElement("img", { alt: label, className: "size-full object-contain", src: value.dataUri });
};

const renderNode = (node: CompositionNode, assets: AssetMap): React.ReactNode => {
  if (node.type === "group") {
    return wrapper(
      node,
      node.children.map((child) => <React.Fragment key={child.id}>{renderNode(child, assets)}</React.Fragment>),
    );
  }
  if (node.type === "text") {
    const classes = {
      display: "text-x-4xl",
      title: "text-x-3xl",
      body: "text-sm text-foreground",
      muted: "text-sm text-muted-foreground",
      eyebrow: "text-xs font-medium uppercase tracking-widest text-primary",
      mono: "font-mono text-sm font-medium text-foreground",
    }[node.role];
    const content =
      node.role === "display" ? <h1 className={classes}>{node.text}</h1> : <div className={classes}>{node.text}</div>;
    return wrapper(
      node,
      <div data-text-target={node.id}>
        {content}

        {node.caret && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary"
            data-caret-for={node.id}
          />
        )}
      </div>,
    );
  }
  if (node.type === "badge") return wrapper(node, <Badge variant={node.variant}>{node.text}</Badge>);
  if (node.type === "chip") {
    const startContent = node.startAsset ? assetImage(assets, node.startAsset, "") : undefined;
    return wrapper(
      node,
      <AppChip size={node.size} startContent={startContent} variant={node.variant}>
        {node.text}
      </AppChip>,
    );
  }
  if (node.type === "providerTile") {
    return wrapper(
      node,
      <Button aria-label={node.label} size={node.size} variant="outline">
        {assetImage(assets, node.asset, "")}
      </Button>,
    );
  }
  if (node.type === "input") {
    return wrapper(
      node,
      <div className="grid gap-2">
        <Label htmlFor={node.id}>{node.label}</Label>

        <Input id={node.id} placeholder={node.placeholder} readOnly value={node.value ?? ""} />

        {node.description && <div className="text-xs text-muted-foreground">{node.description}</div>}
      </div>,
    );
  }
  if (node.type === "alert") {
    return wrapper(
      node,
      <Alert variant={node.variant}>
        <AlertTitle>{node.title}</AlertTitle>

        {node.description && <AlertDescription>{node.description}</AlertDescription>}
      </Alert>,
    );
  }
  if (node.type === "separator") return wrapper(node, <Separator orientation={node.orientation} />);

  if (node.type === "logo") return wrapper(node, assetImage(assets, node.asset, node.label));
  if (node.type === "overlapStack") {
    const entries = node.assets.map((asset, index) => ({ asset, label: node.labels[index] }));
    return wrapper(
      node,
      <OverlappingStack
        badgeKey={(entry) => entry.asset}
        badges={entries}
        renderBadge={(entry) => (
          <Button aria-label={entry.label} size="icon-lg" variant="outline">
            {assetImage(assets, entry.asset, "")}
          </Button>
        )}
        renderOverflow={(count) => <Badge variant="secondary">+{count}</Badge>}
        size={node.size}
      />,
    );
  }
  if (node.type === "focus") {
    const classes = {
      primary: "border-primary text-primary shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_32%,transparent)]",
      success: "border-success text-success shadow-[0_0_28px_color-mix(in_oklab,var(--success)_28%,transparent)]",
      warning: "border-warning text-warning shadow-[0_0_28px_color-mix(in_oklab,var(--warning)_28%,transparent)]",
    }[node.variant];
    return wrapper(
      node,
      <div
        className={`pointer-events-none absolute inset-0 rounded-[inherit] border-2 ${classes}`}
        data-cm-focus-inset={node.inset}
        data-cm-focus-radius={node.radius}
        data-cm-focus-target={node.target}
      >
        {node.label && <span className="absolute -top-7 left-0 font-mono text-xs font-medium">{node.label}</span>}
      </div>,
    );
  }
  if (node.type === "connector") {
    const classes = {
      primary: "text-primary",
      muted: "text-muted-foreground",
      success: "text-success",
    }[node.variant];
    return wrapper(
      node,
      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 size-full overflow-visible ${classes}`}
        data-cm-connector-curve={node.curve}
        data-cm-connector-from={JSON.stringify(node.from)}
        data-cm-connector-to={JSON.stringify(node.to)}
        fill="none"
      >
        <path data-cm-connector-path stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>,
    );
  }
  if (node.type === "table") {
    return wrapper(
      node,
      <div data-table-id={node.id}>
        {node.countLabel && (
          <div className="mb-2 flex justify-end">
            <Badge variant="secondary">
              <span data-count-for={node.id}>0</span>

              <span>{`/${node.countLabel}`}</span>
            </Badge>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              {node.columns.map((column) => (
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {node.rows.map((row, rowIndex) => (
              <TableRow key={row.id} data-cm-component="table-row" data-cm-id={row.id} data-row-index={rowIndex}>
                {node.columns.map((column) => {
                  const cell = row.cells[column.key];
                  if (!cell) throw new Error(`row ${row.id} misses cell ${column.key}`);
                  if (cell.kind === "person") {
                    return (
                      <TableCell key={column.key}>
                        <div className="flex items-center gap-2">
                          <Avatar name={cell.primary} size="lg" />

                          <div>
                            <div className="font-medium">{cell.primary}</div>

                            <div className="text-[11px] text-muted-foreground">{cell.secondary}</div>
                          </div>
                        </div>
                      </TableCell>
                    );
                  }
                  if (cell.kind === "text") return <TableCell key={column.key}>{cell.text}</TableCell>;
                  return (
                    <TableCell key={column.key}>
                      <div className="relative h-5 min-w-20">
                        <span data-state-initial className="absolute inset-0">
                          <Badge variant={cell.initialVariant}>{cell.initial}</Badge>
                        </span>

                        <span data-state-updated className="absolute inset-0 opacity-0">
                          <Badge variant={cell.updatedVariant}>{cell.updated}</Badge>
                        </span>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>,
    );
  }
  return wrapper(
    node,
    <Card className="size-full">
      {(node.title || node.description || node.headerBadge) && (
        <CardHeader>
          {node.title && <CardTitle>{node.title}</CardTitle>}

          {node.description && <CardDescription>{node.description}</CardDescription>}

          {node.headerBadge && (
            <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
              <Badge variant={node.headerBadge.variant}>{node.headerBadge.text}</Badge>
            </div>
          )}
        </CardHeader>
      )}

      <CardContent className="relative flex-1">
        {node.children.map((child) => (
          <React.Fragment key={child.id}>{renderNode(child, assets)}</React.Fragment>
        ))}
      </CardContent>
    </Card>,
  );
};

const inlineFontCss = (packageName: string, family: string, weights: number[]) =>
  weights
    .map((weight) => {
      const cssPath = resolve(`node_modules/${packageName}/latin-${weight}.css`);
      const css = readFileSync(cssPath, "utf8");
      const match = css.match(/url\(\.\/files\/([^)]*?\.woff2)\)/);
      if (!match) throw new Error(`missing font file declaration: ${packageName} ${weight}`);
      const bytes = readFileSync(resolve(dirname(cssPath), "files", match[1]));
      return `@font-face{font-family:'${family}';font-style:normal;font-display:block;font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2')}`;
    })
    .join("\n");

export const compileProductCss = async () => {
  const source = `@import "../../styles/globals.css";\n@source "../../components/ui/card.tsx";\n@source "../../components/ui/button.tsx";\n@source "../../components/ui/badge.tsx";\n@source "../../components/ui/table.tsx";\n@source "../../components/ui/avatar.tsx";\n@source "../../components/ui/input.tsx";\n@source "../../components/ui/label.tsx";\n@source "../../components/ui/alert.tsx";\n@source "../../components/ui/separator.tsx";\n@source "../../components/chip/app-chip.tsx";\n@source "../../components/shared/overlapping-stack.tsx";\n@source "./render.tsx";`;
  const result = await postcss([tailwindPostcss() as never]).process(source, {
    from: resolve("tools/content-motion/motion.css"),
  });
  return `${inlineFontCss("@fontsource/inter", "Inter", [400, 500, 600, 700])}\n${inlineFontCss("@fontsource/jetbrains-mono", "JetBrains Mono", [400, 500])}\n${result.css}`;
};

const runtime = (composition: Composition) => `
const composition=${JSON.stringify({ motions: composition.motions, actions: composition.actions, duration: composition.meta.duration })};
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const ease=(name,value)=>{value=clamp(value);if(name==='linear')return value;if(name==='easeOut')return 1-Math.pow(1-value,3);return value<.5?4*value*value*value:1-Math.pow(-2*value+2,3)/2};
const mix=(a,b,value)=>(a??0)+((b??0)-(a??0))*value;
const cmNode=(id)=>document.querySelector('[data-cm-id="'+id+'"]');
const cmAnchor=(rect,name)=>({
  'top-left':[rect.left,rect.top],'top':[rect.left+rect.width/2,rect.top],'top-right':[rect.right,rect.top],
  'left':[rect.left,rect.top+rect.height/2],'center':[rect.left+rect.width/2,rect.top+rect.height/2],'right':[rect.right,rect.top+rect.height/2],
  'bottom-left':[rect.left,rect.bottom],'bottom':[rect.left+rect.width/2,rect.bottom],'bottom-right':[rect.right,rect.bottom]
}[name]);
const cmPlaceAttached=()=>{
  const bodyRect=document.body.getBoundingClientRect();
  for(const element of document.querySelectorAll('[data-cm-attach]')){
    const spec=JSON.parse(element.dataset.cmAttach);const target=cmNode(spec.target);if(!target)continue;
    const baseRect=element.offsetParent?.getBoundingClientRect()??bodyRect;
    const targetPoint=cmAnchor(target.getBoundingClientRect(),spec.targetAnchor);
    const width=element.offsetWidth;const height=element.offsetHeight;
    const local=cmAnchor({left:0,top:0,right:width,bottom:height,width,height},spec.selfAnchor);
    element.style.left=(targetPoint[0]-baseRect.left-local[0]+spec.offsetX)+'px';
    element.style.top=(targetPoint[1]-baseRect.top-local[1]+spec.offsetY)+'px';
  }
};
const cmPlaceFocus=()=>{
  const bodyRect=document.body.getBoundingClientRect();
  for(const marker of document.querySelectorAll('[data-cm-focus-target]')){
    const holder=marker.closest('[data-cm-id]');const target=cmNode(marker.dataset.cmFocusTarget);if(!holder||!target)continue;
    const baseRect=holder.offsetParent?.getBoundingClientRect()??bodyRect;
    const rect=target.getBoundingClientRect();const inset=Number(marker.dataset.cmFocusInset||0);const radius=Number(marker.dataset.cmFocusRadius||0);
    holder.style.position='absolute';holder.style.left=(rect.left-baseRect.left-inset)+'px';holder.style.top=(rect.top-baseRect.top-inset)+'px';
    holder.style.width=(rect.width+inset*2)+'px';holder.style.height=(rect.height+inset*2)+'px';holder.style.borderRadius=radius+'px';
  }
};
const cmPlaceConnectors=()=>{
  const bodyRect=document.body.getBoundingClientRect();
  for(const svg of document.querySelectorAll('[data-cm-connector-from]')){
    const holder=svg.closest('[data-cm-id]');const from=JSON.parse(svg.dataset.cmConnectorFrom);const to=JSON.parse(svg.dataset.cmConnectorTo);
    const fromTarget=cmNode(from.target);const toTarget=cmNode(to.target);if(!holder||!fromTarget||!toTarget)continue;
    const base=holder.offsetParent??document.body;const baseRect=base.getBoundingClientRect();
    holder.style.position='absolute';holder.style.left='0';holder.style.top='0';holder.style.width=baseRect.width+'px';holder.style.height=baseRect.height+'px';
    const a=cmAnchor(fromTarget.getBoundingClientRect(),from.anchor);const b=cmAnchor(toTarget.getBoundingClientRect(),to.anchor);
    const ax=a[0]-baseRect.left,ay=a[1]-baseRect.top,bx=b[0]-baseRect.left,by=b[1]-baseRect.top;
    const horizontal=svg.dataset.cmConnectorCurve==='horizontal';const c1x=horizontal?(ax+bx)/2:ax;const c1y=horizontal?ay:(ay+by)/2;const c2x=horizontal?(ax+bx)/2:bx;const c2y=horizontal?by:(ay+by)/2;
    svg.setAttribute('viewBox','0 0 '+baseRect.width+' '+baseRect.height);svg.querySelector('[data-cm-connector-path]')?.setAttribute('d','M '+ax+' '+ay+' C '+c1x+' '+c1y+', '+c2x+' '+c2y+', '+bx+' '+by);
  }
};
window.renderFrame=(progress,frame,frameCount)=>{
  const time=progress*composition.duration;
  const states=new Map();
  for(const motion of composition.motions){
    const existing=states.get(motion.target);
    if(time<motion.start&&existing)continue;
    const state=existing??{x:0,y:0,scale:1,opacity:1,rotate:0,rotateX:0,rotateY:0,blur:0,clipTop:0,clipRight:0,clipBottom:0,clipLeft:0,originX:50,originY:50};
    const keys=['x','y','scale','opacity','rotate','rotateX','rotateY','blur','clipTop','clipRight','clipBottom','clipLeft','originX','originY'];
    if(time<motion.start){for(const key of keys)if(motion.from[key]!=null)state[key]=motion.from[key];}
    else if(time>=motion.end){for(const key of keys)if(motion.to[key]!=null)state[key]=motion.to[key];}
    else{const value=ease(motion.easing,(time-motion.start)/(motion.end-motion.start));for(const key of keys)if(motion.from[key]!=null||motion.to[key]!=null)state[key]=mix(motion.from[key]??state[key],motion.to[key]??state[key],value);}
    states.set(motion.target,state);
  }
  for(const [target,state] of states){const element=document.querySelector('[data-motion-id="'+target+'"]');if(!element)continue;element.style.opacity=String(state.opacity);element.style.transformOrigin=state.originX+'% '+state.originY+'%';element.style.transform='perspective(1400px) translate3d('+state.x+'px,'+state.y+'px,0) rotateX('+state.rotateX+'deg) rotateY('+state.rotateY+'deg) rotateZ('+state.rotate+'deg) scale('+state.scale+')';element.style.filter=state.blur?'blur('+state.blur+'px)':'none';element.style.clipPath='inset('+state.clipTop+'% '+state.clipRight+'% '+state.clipBottom+'% '+state.clipLeft+'%)';}
  for(const action of composition.actions){
    const value=clamp((time-action.start)/(action.end-action.start));
    if(action.type==='typeText'){
      const holder=document.querySelector('[data-text-target="'+action.target+'"] > :first-child');
      if(holder)holder.textContent=action.text.slice(0,Math.floor(action.text.length*value));
      const caret=document.querySelector('[data-caret-for="'+action.target+'"]');
      if(caret)caret.style.opacity=value<1||Math.floor(time*1000/action.caretMs)%2===0?'1':'0';
    }
    if(action.type==='updateTable'){
      const table=document.querySelector('[data-table-id="'+action.target+'"]');
      if(!table)continue;
      const rows=[...table.querySelectorAll('[data-row-index]')];
      const completed=Math.min(rows.length,Math.floor(value*rows.length+.0001));
      rows.forEach((row,index)=>{const done=index<completed;row.querySelector('[data-state-initial]')?.style.setProperty('opacity',done?'0':'1');row.querySelector('[data-state-updated]')?.style.setProperty('opacity',done?'1':'0');});
      const count=table.querySelector('[data-count-for="'+action.target+'"]');if(count)count.textContent=String(Math.floor(value*action.total));
    }
  }
  cmPlaceAttached();cmPlaceFocus();cmPlaceConnectors();
};
window.cmAuditLayout=()=>{
  const tolerance=1;const bodyRect=document.body.getBoundingClientRect();const findings=[];const elements=[];
  const boxes=[...document.querySelectorAll('[data-cm-id]')];
  const visible=(element)=>{const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>.01&&rect.width>.5&&rect.height>.5};
  const record=(element)=>{const rect=element.getBoundingClientRect();const style=getComputedStyle(element);const scale=Math.min(rect.width/Math.max(element.offsetWidth,1),rect.height/Math.max(element.offsetHeight,1));return {id:element.dataset.cmId,component:element.dataset.cmComponent||'unknown',rect:{x:rect.x-bodyRect.x,y:rect.y-bodyRect.y,width:rect.width,height:rect.height,right:rect.right-bodyRect.x,bottom:rect.bottom-bodyRect.y},scale:Number.isFinite(scale)?scale:1,padding:{left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0,top:parseFloat(style.paddingTop)||0,bottom:parseFloat(style.paddingBottom)||0}}};
  for(const element of boxes){if(!visible(element))continue;const item=record(element);elements.push(item);
    if(item.rect.x<-tolerance||item.rect.y<-tolerance||item.rect.right>bodyRect.width+tolerance||item.rect.bottom>bodyRect.height+tolerance)findings.push({code:'out-of-bounds',id:item.id});
    if(element.scrollWidth>element.clientWidth+tolerance||element.scrollHeight>element.clientHeight+tolerance)findings.push({code:'content-clipped',id:item.id});
    if(element.dataset.cmCheckPadding==='true'&&(Math.abs(item.padding.left-item.padding.right)>2||Math.abs(item.padding.top-item.padding.bottom)>2))findings.push({code:'asymmetric-padding',id:item.id,padding:item.padding});
    if(element.dataset.cmCritical==='true'){
      const min=Number(element.dataset.cmMinPhonePx||9);const textNodes=[element,...element.querySelectorAll('*')].filter((child)=>visible(child)&&child.textContent?.trim()&&child.children.length===0);
      for(const textNode of textNodes){const textStyle=getComputedStyle(textNode);const effective=(parseFloat(textStyle.fontSize)||0)*item.scale*360/bodyRect.width;if(effective<min)findings.push({code:'phone-type-too-small',id:item.id,effective:Math.round(effective*10)/10,min});}
    }
  }
  const qaBoxes=boxes.filter((element)=>element.dataset.cmQaBox==='true'&&visible(element));
  for(let a=0;a<qaBoxes.length;a++)for(let b=a+1;b<qaBoxes.length;b++){
    const first=qaBoxes[a],second=qaBoxes[b];if(first.contains(second)||second.contains(first))continue;
    const allowed=new Set([...(first.dataset.cmAllowOverlap||'').split(','),...(second.dataset.cmAllowOverlap||'').split(',')]);if(allowed.has(first.dataset.cmId)||allowed.has(second.dataset.cmId))continue;
    const x=first.getBoundingClientRect(),y=second.getBoundingClientRect();const overlap=Math.min(x.right,y.right)-Math.max(x.left,y.left)>tolerance&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>tolerance;
    if(overlap)findings.push({code:'unexpected-overlap',ids:[first.dataset.cmId,second.dataset.cmId]});
  }
  const groups=new Map();for(const element of qaBoxes){const group=element.dataset.cmAlignmentGroup;if(!group)continue;const key=group+':'+(element.dataset.cmAlignment||'left');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(element);}
  for(const [key,members] of groups){if(members.length<2)continue;const alignment=key.split(':').at(-1);const rails=members.map((element)=>{const rect=element.getBoundingClientRect();return alignment==='right'?rect.right:alignment==='center'?rect.left+rect.width/2:rect.left});if(Math.max(...rails)-Math.min(...rails)>2)findings.push({code:'alignment-drift',group:key,ids:members.map((element)=>element.dataset.cmId)});}
  for(const marker of document.querySelectorAll('[data-cm-focus-target]')){if(!visible(marker))continue;const holder=marker.closest('[data-cm-id]');const target=cmNode(marker.dataset.cmFocusTarget);if(!holder||!target){findings.push({code:'unknown-focus-target',id:holder?.dataset.cmId});continue;}const focus=holder.getBoundingClientRect(),rect=target.getBoundingClientRect();if(focus.left>rect.left+tolerance||focus.top>rect.top+tolerance||focus.right<rect.right-tolerance||focus.bottom<rect.bottom-tolerance)findings.push({code:'focus-misses-target',id:holder.dataset.cmId,target:marker.dataset.cmFocusTarget});}
  return {ok:findings.length===0,findings,elements,canvas:{width:bodyRect.width,height:bodyRect.height}};
};
window.renderFrame(0,0,${Math.round(composition.meta.duration * composition.meta.fps)});`;

export const buildCompositionHtml = async (input: unknown, roots: AssetRoots) => {
  const composition = compositionSchema.parse(input);
  const assets = loadAssets(composition, roots);
  const css = await compileProductCss();
  const markup = renderToStaticMarkup(
    <>
      {composition.nodes.map((node) => (
        <React.Fragment key={node.id}>{renderNode(node, assets)}</React.Fragment>
      ))}
    </>,
  );
  const meta = JSON.stringify({
    width: composition.meta.width,
    height: composition.meta.height,
    duration: composition.meta.duration,
    fps: composition.meta.fps,
  });
  const productMeta = JSON.stringify({
    productRef: composition.meta.productRef,
    componentSource: "customermates-product",
    schemaVersion: 2,
  });
  return `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=${composition.meta.width},initial-scale=1"><title>${htmlEscape(composition.meta.title)}</title><style>${css}\n*{box-sizing:border-box}html,body{width:${composition.meta.width}px;height:${composition.meta.height}px;margin:0;overflow:hidden}body{position:relative;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-feature-settings:"cv11","ss01","ss03"}body>div[data-motion-id]{transform-origin:center}</style></head><body class="bg-background text-foreground"><script type="application/json" id="cm-video-meta">${meta}</script><script type="application/json" id="cm-product-meta">${productMeta}</script>${markup}<script>${runtime(composition)}</script></body></html>`;
};

export const verifyProductAuthority = (repo: string, expectedRef: string) => {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  if (actual !== expectedRef) throw new Error(`product ref mismatch: expected ${expectedRef}, got ${actual}`);
  const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  if (status) throw new Error("product worktree must be clean before composition build");
  return actual;
};
