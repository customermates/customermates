import { useEffect, useRef, useState } from "react";

export function useStickyChip() {
  const chipRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const lastScrollTopRef = useRef<number>(0);
  const [distanceFromTop, setDistanceFromTop] = useState(-16);

  useEffect(() => {
    function updateDistance() {
      const isMd = window.matchMedia("(min-width: 768px)").matches;
      setDistanceFromTop(isMd ? -16 : -8);
    }

    updateDistance();
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    mediaQuery.addEventListener("change", updateDistance);

    return () => {
      mediaQuery.removeEventListener("change", updateDistance);
    };
  }, []);

  useEffect(() => {
    let rafId: number | null = null;
    let scrollTimeoutId: NodeJS.Timeout | null = null;
    const scrollContainer = document.getElementById("scroll-container");

    if (!scrollContainer) return;

    function updateTopOffset() {
      const chipElement = chipRef.current;
      if (!chipElement) return;

      const rect = chipElement.getBoundingClientRect();
      const distance = rect.top - distanceFromTop;
      const shouldStick = distance <= 0;

      if (shouldStick) chipElement.style.top = `${distanceFromTop}px`;
      else chipElement.style.top = "";

      setIsSticky(shouldStick);
    }

    function handleScroll() {
      if (!scrollContainer) return;

      const currentScrollTop = scrollContainer.scrollTop;
      const scrollTopChanged = currentScrollTop !== lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      if (!scrollTopChanged) return;

      setIsSticky(false);

      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);

      scrollTimeoutId = setTimeout(() => {
        if (!rafId) rafId = requestAnimationFrame(() => (updateTopOffset(), (rafId = null)));
      }, 150);
    }

    lastScrollTopRef.current = scrollContainer.scrollTop;
    requestAnimationFrame(updateTopOffset);
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [distanceFromTop]);

  return { chipRef, isSticky };
}
