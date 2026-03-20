type MenuPosition = {
  top: number;
  left: number;
};

type Props = {
  cursorTop: number;
  cursorBottom: number;
  cursorLeft: number;
  cursorRight?: number;
  menuWidth: number;
  menuHeight: number;
  centered?: boolean;
};

export function calculateMenuPosition({
  cursorTop,
  cursorBottom,
  cursorLeft,
  cursorRight,
  menuWidth,
  menuHeight,
  centered = false,
}: Props): MenuPosition {
  const gap = 10;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const spaceAbove = cursorTop;
  const spaceBelow = viewportHeight - cursorBottom;

  let top = cursorTop - menuHeight - gap;

  if (top < 0 && spaceBelow > spaceAbove) top = cursorBottom + gap;
  else if (top < 0) top = gap;

  let left = centered && cursorRight !== undefined ? (cursorLeft + cursorRight) / 2 - menuWidth / 2 : cursorLeft;

  if (left + menuWidth > viewportWidth) left = viewportWidth - menuWidth - gap;
  if (left < 0) left = gap;

  return { top, left };
}
