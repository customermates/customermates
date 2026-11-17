"use client";

import { useTranslations } from "next-intl";

import { CopyableCode } from "@/components/shared/copyable-code";

import { runnerDockerCommand, runnerNpxCommand } from "./agent-runner-commands";

type Props = { url: string; token: string };

export function AgentRunnerCommandsView({ url, token }: Props) {
  const t = useTranslations();

  return (
    <div data-agent-runner-commands className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">{t("Runners.installTitle")}</h3>

        <p className="text-xs text-muted-foreground">{t("Runners.installDescription")}</p>

        <CopyableCode anchorId="agent-runner-copy-npx" id="agent-runner-npx" value={runnerNpxCommand(url, token)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">{t("Runners.dockerTitle")}</h3>

        <p className="text-xs text-muted-foreground">{t("Runners.dockerDescription")}</p>

        <CopyableCode
          anchorId="agent-runner-copy-docker"
          id="agent-runner-docker"
          value={runnerDockerCommand(url, token)}
        />
      </div>
    </div>
  );
}
