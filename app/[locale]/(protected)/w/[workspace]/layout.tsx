import { notFound } from "next/navigation";

import { ProtectedFrame } from "./protected-frame";

import { isWorkspaceSlugSegment } from "@/core/navigation/workspace-paths";
import { rememberRequestedWorkspace } from "@/features/workspace/next/workspace-visit";

type Props = {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
};

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace } = await params;
  if (!isWorkspaceSlugSegment(workspace)) notFound();

  await rememberRequestedWorkspace(workspace);

  return <ProtectedFrame>{children}</ProtectedFrame>;
}
