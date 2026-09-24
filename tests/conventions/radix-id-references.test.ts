import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee"];

type Reference = {
  root: string;
  owner: string;
  referrer: string;
  attribute: "aria-labelledby" | "aria-describedby" | "aria-controls";
  matchValue?: boolean;
};

const REFERENCES: Reference[] = [
  { root: "Tabs", owner: "TabsTrigger", referrer: "TabsContent", attribute: "aria-labelledby", matchValue: true },
  { root: "Tabs", owner: "TabsContent", referrer: "TabsTrigger", attribute: "aria-controls", matchValue: true },
  { root: "DropdownMenu", owner: "DropdownMenuTrigger", referrer: "DropdownMenuContent", attribute: "aria-labelledby" },
  { root: "DropdownMenu", owner: "DropdownMenuContent", referrer: "DropdownMenuTrigger", attribute: "aria-controls" },
  { root: "Popover", owner: "PopoverContent", referrer: "PopoverTrigger", attribute: "aria-controls" },
  { root: "Collapsible", owner: "CollapsibleContent", referrer: "CollapsibleTrigger", attribute: "aria-controls" },
  { root: "AccordionItem", owner: "AccordionTrigger", referrer: "AccordionContent", attribute: "aria-labelledby" },
  { root: "AccordionItem", owner: "AccordionContent", referrer: "AccordionTrigger", attribute: "aria-controls" },
  { root: "Select", owner: "SelectContent", referrer: "SelectTrigger", attribute: "aria-controls" },
  { root: "SelectGroup", owner: "SelectLabel", referrer: "SelectGroup", attribute: "aria-labelledby" },
  ...["Dialog", "AlertDialog", "Sheet", "Drawer"].flatMap((root): Reference[] => [
    { root, owner: `${root}Title`, referrer: `${root}Content`, attribute: "aria-labelledby" },
    { root, owner: `${root}Description`, referrer: `${root}Content`, attribute: "aria-describedby" },
    { root, owner: `${root}Content`, referrer: `${root}Trigger`, attribute: "aria-controls" },
  ]),
];

const CMDK_PARTS_WITH_OWN_ID = ["CommandInput", "CommandList", "CommandItem"];

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

function openingOf(node: JsxNode): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function tagOf(node: JsxNode): string {
  return openingOf(node).tagName.getText();
}

function attributeOf(node: JsxNode, name: string): ts.JsxAttribute | undefined {
  return openingOf(node).attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function expressionText(expression: ts.Expression, source: ts.SourceFile): string {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return JSON.stringify(expression.text);
  return expression.getText(source);
}

function attributeText(attribute: ts.JsxAttribute | undefined, source: ts.SourceFile): string | undefined {
  const initializer = attribute?.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return JSON.stringify(initializer.text);
  if (ts.isJsxExpression(initializer) && initializer.expression) return expressionText(initializer.expression, source);
  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}

function objectProperty(expression: ts.Expression, name: string, source: ts.SourceFile): string | undefined {
  const target = unwrap(expression);
  if (ts.isConditionalExpression(target))
    return objectProperty(target.whenTrue, name, source) ?? objectProperty(target.whenFalse, name, source);
  if (!ts.isObjectLiteralExpression(target)) return undefined;
  for (const property of target.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name;
    const keyText = ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
    if (keyText === name) return expressionText(property.initializer, source);
  }
  return undefined;
}

function spreadAttributeText(node: JsxNode, name: string, source: ts.SourceFile): string | undefined {
  for (const property of openingOf(node).attributes.properties) {
    if (!ts.isJsxSpreadAttribute(property)) continue;
    const text = objectProperty(property.expression, name, source);
    if (text !== undefined) return text;
  }
  return undefined;
}

function ownAttributeText(node: JsxNode, name: string, source: ts.SourceFile): string | undefined {
  return attributeText(attributeOf(node, name), source) ?? spreadAttributeText(node, name, source);
}

function localJsx(name: string, source: ts.SourceFile): JsxNode | undefined {
  let found: JsxNode | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      const initializer = unwrap(node.initializer);
      if (ts.isJsxElement(initializer) || ts.isJsxSelfClosingElement(initializer)) found = initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function asChildTarget(node: JsxNode, source: ts.SourceFile): JsxNode | undefined {
  if (!ts.isJsxElement(node) || !attributeOf(node, "asChild")) return undefined;
  for (const child of node.children) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return child;
    if (ts.isJsxExpression(child) && child.expression && ts.isIdentifier(child.expression))
      return localJsx(child.expression.text, source);
  }
  return undefined;
}

function renderedAttribute(node: JsxNode, name: string, source: ts.SourceFile): string | undefined {
  const own = ownAttributeText(node, name, source);
  if (own !== undefined) return own;
  const target = asChildTarget(node, source);
  return target ? ownAttributeText(target, name, source) : undefined;
}

function nearestRoot(node: ts.Node, root: string): JsxNode | undefined {
  for (let parent = node.parent; parent; parent = parent.parent)
    if ((ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) && tagOf(parent) === root) return parent;
  return undefined;
}

function descendants(scope: ts.Node, tag: string): JsxNode[] {
  const found: JsxNode[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagOf(node) === tag) found.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(scope, visit);
  return found;
}

function customIdReferenceViolations(sources: { file: string; text: string }[]): string[] {
  const violations: string[] = [];

  for (const { file, text } of sources) {
    if (!REFERENCES.some((reference) => text.includes(`<${reference.owner}`))) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    for (const reference of REFERENCES) {
      for (const owner of descendants(source, reference.owner)) {
        const customId = renderedAttribute(owner, "id", source);
        if (customId === undefined) continue;

        const scope = nearestRoot(owner, reference.root);
        if (!scope) continue;

        const ownerValue = attributeText(attributeOf(owner, "value"), source);
        const candidates = reference.referrer === reference.root ? [scope] : descendants(scope, reference.referrer);
        const referrers = candidates.filter(
          (referrer) => !reference.matchValue || attributeText(attributeOf(referrer, "value"), source) === ownerValue,
        );

        for (const referrer of referrers) {
          if (renderedAttribute(referrer, reference.attribute, source) === customId) continue;
          const { line } = source.getLineAndCharacterOfPosition(openingOf(referrer).getStart(source));
          violations.push(
            `${file}:${line + 1}: <${reference.referrer}> needs ${reference.attribute}={${customId}} to match the custom id on <${reference.owner}>`,
          );
        }
      }
    }
  }

  return violations;
}

function cmdkIdViolations(sources: { file: string; text: string }[]): string[] {
  const violations: string[] = [];

  for (const { file, text } of sources) {
    if (!CMDK_PARTS_WITH_OWN_ID.some((part) => text.includes(`<${part}`))) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    for (const part of CMDK_PARTS_WITH_OWN_ID) {
      for (const node of descendants(source, part)) {
        if (ownAttributeText(node, "id", source) === undefined) continue;
        const { line } = source.getLineAndCharacterOfPosition(openingOf(node).getStart(source));
        violations.push(`${file}:${line + 1}: <${part}> drops its custom id because cmdk sets its own`);
      }
    }
  }

  return violations;
}

function sourceFiles(): { file: string; text: string }[] {
  return SCANNED_DIRECTORIES.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => path.endsWith(".tsx")),
  ).map((path) => ({ file: relative(REPO_ROOT, path), text: readFileSync(path, "utf8") }));
}

describe("custom ids on Radix parts", () => {
  it("repoints every Radix aria reference at the custom id that replaced the generated one", () => {
    const violations = customIdReferenceViolations(sourceFiles());

    expect(
      violations,
      `A custom id replaces the id Radix generated, so the part that referenced it must name the custom id:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("flags a tab panel, menu and dialog left pointing at the generated id", () => {
    const bad = [
      '<Tabs><TabsList><TabsTrigger id="a-tab" value="a">A</TabsTrigger></TabsList><TabsContent value="a" /></Tabs>',
      '<DropdownMenu><DropdownMenuTrigger asChild><Button id="menu">M</Button></DropdownMenuTrigger><DropdownMenuContent /></DropdownMenu>',
      'const trigger = (<Button id="shared">T</Button>);\nconst A = () => (<DropdownMenu><DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger><DropdownMenuContent /></DropdownMenu>);',
      '<Dialog><DialogContent><DialogTitle id="title">T</DialogTitle></DialogContent></Dialog>',
      '<Popover><PopoverTrigger asChild><button /></PopoverTrigger><PopoverContent id="panel" /></Popover>',
      '<Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger><DialogContent id="dialog" /></Dialog>',
      '<AlertDialog><AlertDialogTrigger>Open</AlertDialogTrigger><AlertDialogContent id="alert" /></AlertDialog>',
      '<Sheet><SheetTrigger>Open</SheetTrigger><SheetContent id="sheet" /></Sheet>',
      '<Drawer><DrawerTrigger>Open</DrawerTrigger><DrawerContent id="drawer" /></Drawer>',
      '<AccordionItem value="a"><AccordionTrigger>A</AccordionTrigger><AccordionContent id="a-body" /></AccordionItem>',
      '<Select><SelectTrigger /><SelectContent id="options" /></Select>',
      '<SelectGroup><SelectLabel id="group-label">G</SelectLabel></SelectGroup>',
      '<Tabs><TabsList><TabsTrigger {...{ id: "a-tab" }} value="a">A</TabsTrigger></TabsList><TabsContent value="a" /></Tabs>',
    ];
    const good = [
      '<Tabs><TabsList><TabsTrigger id="a-tab" value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList><TabsContent aria-labelledby="a-tab" value="a" /><TabsContent value="b" /></Tabs>',
      "<DropdownMenu><DropdownMenuTrigger asChild><Button id={id}>M</Button></DropdownMenuTrigger><DropdownMenuContent aria-labelledby={id} /></DropdownMenu>",
      '<Popover><PopoverTrigger asChild><button aria-controls="panel" /></PopoverTrigger><PopoverContent id="panel" /></Popover>',
      '<Tabs><TabsList><TabsTrigger id={`${scope}-table`} value="table" /></TabsList></Tabs>',
      '<Dialog><DialogTrigger asChild><Button aria-controls="dialog">Open</Button></DialogTrigger><DialogContent id="dialog" /></Dialog>',
      '<AccordionItem value="a"><AccordionTrigger aria-controls="a-body">A</AccordionTrigger><AccordionContent id="a-body" /></AccordionItem>',
      '<SelectGroup aria-labelledby="group-label"><SelectLabel id="group-label">G</SelectLabel></SelectGroup>',
      '<Tabs><TabsList><TabsTrigger id="a-tab" value="a">A</TabsTrigger></TabsList><TabsContent {...(ready ? { "aria-labelledby": "a-tab" } : {})} value="a" /></Tabs>',
    ];

    for (const text of bad) expect(customIdReferenceViolations([{ file: "bad.tsx", text }]), text).toHaveLength(1);
    for (const text of good) expect(customIdReferenceViolations([{ file: "good.tsx", text }]), text).toHaveLength(0);
  });
});

describe("custom ids on cmdk parts", () => {
  it("never passes an id that cmdk replaces with its own", () => {
    const violations = cmdkIdViolations(sourceFiles());

    expect(
      violations,
      `cmdk renders its own id on these parts, so a custom id never reaches the DOM; put it on a wrapper instead:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("flags an input, list or item carrying a custom id and accepts a wrapper", () => {
    const bad = [
      '<Command><CommandInput id="search" /></Command>',
      '<Command><CommandList id="results" /></Command>',
      '<Command><CommandList><CommandItem {...{ id: "row" }} /></CommandList></Command>',
    ];
    const good = ['<Command><div id="search"><CommandInput placeholder="Search" /></div></Command>'];

    for (const text of bad) expect(cmdkIdViolations([{ file: "bad.tsx", text }]), text).toHaveLength(1);
    for (const text of good) expect(cmdkIdViolations([{ file: "good.tsx", text }]), text).toHaveLength(0);
  });
});
