import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, runInAction } from "mobx";

import {
  checkAgentHealthAction,
  getAgentControlUrlAction,
  getAgentProvisionedAction,
  resetAgentAction,
  verifyAgentMachineAction,
} from "@/app/[locale]/(protected)/ai-agent/actions";

export class AppSidebarStore {
  agentProvisioned: boolean | null = null;
  agentBooting = false;

  constructor(private rootStore: RootStore) {
    makeObservable(this, {
      agentProvisioned: observable,
      agentBooting: observable,

      refreshAgentStatus: action,
      openControlUi: action,
      resetAgent: action,
    });
  }

  refreshAgentStatus = async (): Promise<boolean> => {
    runInAction(() => {
      this.agentBooting = true;
    });

    try {
      const { provisioned } = await getAgentProvisionedAction();
      runInAction(() => {
        this.agentProvisioned = provisioned;
      });

      if (!provisioned) return false;

      const { healthy } = await checkAgentHealthAction();
      if (healthy) return true;

      for (let i = 0; i < 60; i++) {
        try {
          const { healthy: polledHealthy } = await checkAgentHealthAction();
          if (polledHealthy) return true;
        } catch {}

        if (i === 2) {
          try {
            const { exists } = await verifyAgentMachineAction();
            if (!exists) {
              runInAction(() => {
                this.agentProvisioned = false;
              });
              return false;
            }
          } catch {}
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      return false;
    } catch {
      runInAction(() => {
        this.agentProvisioned = false;
      });
      return false;
    } finally {
      runInAction(() => {
        this.agentBooting = false;
      });
    }
  };

  openControlUi = async () => {
    const credentials = await getAgentControlUrlAction();
    if (!credentials) {
      runInAction(() => {
        this.agentProvisioned = false;
      });
      return;
    }

    const isHealthy = await this.refreshAgentStatus();
    if (!isHealthy || typeof window === "undefined") return;

    const { url, token, machineId } = credentials;
    window.open(`${url}/?machine=${machineId}#token=${token}`, "_blank", "noopener,noreferrer");
  };

  resetAgent = async () => {
    await this.rootStore.loadingOverlayStore.withLoading(() => resetAgentAction());
    await this.refreshAgentStatus();
  };
}
