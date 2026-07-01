import { Resource } from "@/generated/prisma";

import { AgentSkillsCard } from "../components/agent-skill/agent-skills-card";

import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function CompanyAgentSkillsPage() {
  await requireAccess({ resource: Resource.company });

  return (
    <PageContainer padded={false}>
      <AgentSkillsCard />
    </PageContainer>
  );
}
