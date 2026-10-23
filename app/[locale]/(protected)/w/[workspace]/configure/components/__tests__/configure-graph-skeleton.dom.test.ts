import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONFIGURE_GRAPH_SKELETON_EDGES,
  CONFIGURE_GRAPH_SKELETON_NODES,
  ConfigureGraphSkeleton,
} from "../configure-graph-skeleton";

function render(animated?: boolean) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(ConfigureGraphSkeleton, { animated }));
  return host;
}

describe("ConfigureGraphSkeleton", () => {
  it("draws list cards on a dotted canvas joined by decorative connectors", () => {
    const skeleton = render().querySelector("[data-configure-graph-skeleton]");
    const canvas = skeleton?.querySelector(".lg\\:block");
    const stacked = skeleton?.querySelector(".lg\\:hidden");

    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.hasAttribute("data-page-skeleton-loading")).toBe(true);
    expect(skeleton?.className).toContain("bg-size-[18px_18px]");
    expect(canvas?.querySelectorAll("[data-configure-graph-skeleton-node]")).toHaveLength(
      CONFIGURE_GRAPH_SKELETON_NODES.length,
    );
    expect(canvas?.querySelectorAll("[data-configure-graph-skeleton-edge]")).toHaveLength(
      CONFIGURE_GRAPH_SKELETON_EDGES.length,
    );
    expect(stacked?.querySelectorAll("[data-configure-graph-skeleton-node]")).toHaveLength(3);
  });

  it("runs every connector between the centres of the two cards it joins", () => {
    const edges = Array.from(render().querySelectorAll<HTMLElement>("[data-configure-graph-skeleton-edge]"));

    CONFIGURE_GRAPH_SKELETON_EDGES.forEach(([from, to], index) => {
      const [a, b] = [CONFIGURE_GRAPH_SKELETON_NODES[from], CONFIGURE_GRAPH_SKELETON_NODES[to]];
      if (!a || !b) throw new Error("edge references a missing node");
      expect(edges[index]?.style.left).toBe(`${Math.min(a.x, b.x)}%`);
      expect(edges[index]?.style.top).toBe(`${Math.min(a.y, b.y)}%`);
      expect(edges[index]?.style.width).toBe(`${Math.abs(a.x - b.x)}%`);
      expect(edges[index]?.style.height).toBe(`${Math.abs(a.y - b.y)}%`);
    });
  });

  it("renders a still empty variant without motion", () => {
    const skeleton = render(false).querySelector("[data-configure-graph-skeleton]");

    expect(skeleton?.hasAttribute("data-page-skeleton-empty")).toBe(true);
    expect(skeleton?.querySelector("[data-skeleton-motion]")).toBeNull();
  });
});
