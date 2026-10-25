const MAP_COLOR_TOKENS = {
  land: "var(--card)",
  border: "var(--border)",
  label: "var(--muted-foreground)",
  halo: "var(--card)",
} as const;

export type MapPalette = { land: string; border: string; label: string; halo: string };

function resolveColor(probe: HTMLElement, expression: string) {
  probe.style.color = "";
  probe.style.color = expression;
  return getComputedStyle(probe).color;
}

export function resolvePalette(probe: HTMLElement): MapPalette {
  return {
    land: resolveColor(probe, MAP_COLOR_TOKENS.land),
    border: resolveColor(probe, MAP_COLOR_TOKENS.border),
    label: resolveColor(probe, MAP_COLOR_TOKENS.label),
    halo: resolveColor(probe, MAP_COLOR_TOKENS.halo),
  };
}
