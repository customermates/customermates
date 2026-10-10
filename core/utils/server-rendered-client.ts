import { createElement, type ComponentType } from "react";

export function serverRenderedClient<P extends object>(Component: ComponentType<P>) {
  return function ServerRenderedClient(props: P) {
    return createElement(Component, props);
  };
}
