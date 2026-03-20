import { useEffect, useState } from "react";

type UseStickyHeaderArgs = {
  resizingColumn: string | null;
  tableRef: React.RefObject<HTMLElement>;
};

export function useStickyHeader({ resizingColumn, tableRef }: UseStickyHeaderArgs) {
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    let rafId: number | null = null;
    let scrollTimeoutId: NodeJS.Timeout | null = null;
    const distanceFromTop = 8;
    const scrollContainer = document.getElementById("scroll-container");

    function updateTopOffset() {
      const thead = tableRef.current?.querySelector<HTMLElement>("thead");
      if (!thead) return;

      thead.style.top = "";
      const distance = thead.getBoundingClientRect().top - distanceFromTop;
      const shouldStick = distance <= 0;
      if (shouldStick) thead.style.top = `${Math.abs(distance)}px`;
      setIsSticky(shouldStick);
    }

    function handleScroll() {
      setIsSticky(false);

      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);

      scrollTimeoutId = setTimeout(() => {
        if (!rafId) rafId = requestAnimationFrame(() => (updateTopOffset(), (rafId = null)));
      }, 150);
    }

    requestAnimationFrame(updateTopOffset);
    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [resizingColumn]);

  return { tableRef, isSticky };
}
