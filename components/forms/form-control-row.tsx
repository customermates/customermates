import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  startAddon?: ReactNode;
};

export function FormControlRow({ children, startAddon }: Props) {
  return (
    <div data-form-control-row className="relative w-full min-w-0">
      {startAddon ? (
        <div className="absolute right-full top-1/2 flex -translate-y-1/2 items-center pr-2">{startAddon}</div>
      ) : null}

      {children}
    </div>
  );
}
