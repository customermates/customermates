"use client";

import type { ReactElement, ReactNode } from "react";
import { createElement } from "react";

type Props = {
  textValue?: string;
  children: ReactNode;
};

export function FormAutocompleteItem({ textValue, children }: Props): ReactElement {
  // eslint-disable-next-line react/no-children-prop
  return createElement(AutocompleteItemInner, { textValue, children });
}

function AutocompleteItemInner({ children }: { textValue?: string; children: ReactNode }) {
  return <span>{children}</span>;
}
