"use client";

import type { ReactNode } from "react";

type Props = {
  id: string;
  children: ReactNode;
};

export function FormFieldError({ id, children }: Props) {
  return (
    <p className="text-xs text-destructive" id={id} role="alert">
      {children}
    </p>
  );
}
