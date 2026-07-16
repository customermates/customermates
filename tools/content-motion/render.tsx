import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import tailwindPostcss from "@tailwindcss/postcss";
import postcss from "postcss";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppChip } from "@/components/chip/app-chip";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  return style;
};

const wrapper = (node: CompositionNode, content: React.ReactNode) => (
  <div data-motion-id={node.id} style={layoutStyle(node.layout)}>
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
              <TableRow key={row.id} data-row-index={rowIndex}>
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
  const source = `@import "../../styles/globals.css";\n@source "../../components/ui/card.tsx";\n@source "../../components/ui/button.tsx";\n@source "../../components/ui/badge.tsx";\n@source "../../components/ui/table.tsx";\n@source "../../components/ui/avatar.tsx";\n@source "../../components/chip/app-chip.tsx";\n@source "../../components/shared/overlapping-stack.tsx";\n@source "./render.tsx";`;
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
window.renderFrame=(progress,frame,frameCount)=>{
  const time=progress*composition.duration;
  const states=new Map();
  for(const motion of composition.motions){
    const existing=states.get(motion.target);
    if(time<motion.start&&existing)continue;
    const state=existing??{x:0,y:0,scale:1,opacity:1};
    if(time<motion.start){for(const key of ['x','y','scale','opacity'])if(motion.from[key]!=null)state[key]=motion.from[key];}
    else if(time>=motion.end){for(const key of ['x','y','scale','opacity'])if(motion.to[key]!=null)state[key]=motion.to[key];}
    else{const value=ease(motion.easing,(time-motion.start)/(motion.end-motion.start));for(const key of ['x','y','scale','opacity'])if(motion.from[key]!=null||motion.to[key]!=null)state[key]=mix(motion.from[key]??state[key],motion.to[key]??state[key],value);}
    states.set(motion.target,state);
  }
  for(const [target,state] of states){const element=document.querySelector('[data-motion-id="'+target+'"]');if(!element)continue;element.style.opacity=String(state.opacity);element.style.transform='translate3d('+state.x+'px,'+state.y+'px,0) scale('+state.scale+')';}
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
    schemaVersion: 1,
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
