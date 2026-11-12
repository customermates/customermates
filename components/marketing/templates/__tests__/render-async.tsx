import type { ReactElement, ReactNode } from "react";

import { Fragment, cloneElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Component = (props: unknown) => ReactNode | Promise<ReactNode>;

async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    const children = await Promise.all(node.map((child) => resolve(child as ReactNode)));
    return children.map((child, index) => <Fragment key={index}>{child}</Fragment>);
  }
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function") return resolve(await (element.type as Component)(element.props));
  if (element.type === Fragment) return resolve(element.props.children);
  if (element.props.children === undefined) return element;

  return cloneElement(element, undefined, await resolve(element.props.children));
}

export async function renderAsync(node: ReactNode): Promise<string> {
  return renderToStaticMarkup(<>{await resolve(node)}</>);
}
