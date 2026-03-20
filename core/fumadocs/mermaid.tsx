"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

type Props = {
  chart: string;
};

export function Mermaid({ chart }: Props) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [svg, setSvg] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    let isCancelled = false;

    async function render() {
      const { default: mermaid } = await import("mermaid");

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        themeCSS: "margin: 1rem auto 0;",
        theme: resolvedTheme === "dark" ? "dark" : "default",
        themeVariables: {
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
      });

      const renderId = `mermaid-${id.replaceAll(":", "")}-${resolvedTheme ?? "light"}`;
      const { svg: renderedSvg } = await mermaid.render(renderId, chart.replaceAll("\\n", "\n"));

      if (!isCancelled) setSvg(renderedSvg);
    }

    void render();

    return () => {
      isCancelled = true;
    };
  }, [chart, id, isMounted, resolvedTheme]);

  if (!isMounted || !svg) return null;

  return <div dangerouslySetInnerHTML={{ __html: svg }} className="not-prose overflow-x-auto" />;
}
