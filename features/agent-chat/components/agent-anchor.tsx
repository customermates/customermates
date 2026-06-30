"use client";

import type { ReactNode } from "react";

import { useAgentTarget } from "../ui-targets";

type Props = {
  id: string;
  description: string;
  route?: string;
  as?: "div" | "section" | "span";
  className?: string;
  children: ReactNode;
};

/**
 * Wrap a region to make it an agent target when there's no single element to
 * spread useAgentTarget onto.
 *
 *   <AgentAnchor id="dashboard.widgets" description="Your dashboard widgets">…</AgentAnchor>
 */
export function AgentAnchor({ id, description, route, as: Tag = "div", className, children }: Props) {
  const target = useAgentTarget(id, description, { route });
  return (
    <Tag className={className} {...target}>
      {children}
    </Tag>
  );
}
