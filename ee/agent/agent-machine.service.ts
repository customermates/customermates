import { UserAccessor } from "@/core/base/user-accessor";
import { AGENT_BASE_URL, BASE_URL } from "@/constants/env";
import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

const FLY_API_BASE = "https://api.machines.dev/v1";
const FLY_REGION = "ams";
const FLY_API_TOKEN = process.env.FLY_API_TOKEN ?? "";
const FLY_APP_NAME = process.env.FLY_APP_NAME ?? "";
const DESTROY_VOLUME_MAX_ATTEMPTS = 8;
const DESTROY_VOLUME_RETRY_DELAY_MS = 1500;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

@TenantScoped
export class AgentMachineService extends UserAccessor {
  async createVolume() {
    const userId = this.user.id;
    const name = `vol_${userId.replace(/-/g, "").slice(0, 26)}`;
    const result = await this.flyApiFetch(`/apps/${FLY_APP_NAME}/volumes`, {
      method: "POST",
      body: JSON.stringify({
        name,
        size_gb: 5,
        region: FLY_REGION,
      }),
    });

    return result.id;
  }

  async createMachine(args: {
    volumeId: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    crmApiKey: string;
    gatewayToken: string;
    hooksToken: string;
  }): Promise<string> {
    const env: Record<string, string> = {
      OPENCLAW_GATEWAY_TOKEN: args.gatewayToken,
      OPENCLAW_HOOKS_TOKEN: args.hooksToken,
      CRM_API_URL: BASE_URL,
      CRM_API_KEY: args.crmApiKey,
      AGENT_BASE_URL,
      NODE_OPTIONS: "--max-old-space-size=1024",
    };

    if (args.anthropicApiKey) env.ANTHROPIC_API_KEY = args.anthropicApiKey;
    if (args.openaiApiKey) env.OPENAI_API_KEY = args.openaiApiKey;

    const result = await this.flyApiFetch(`/apps/${FLY_APP_NAME}/machines`, {
      method: "POST",
      body: JSON.stringify({
        region: FLY_REGION,
        config: {
          image: `registry.fly.io/${FLY_APP_NAME}:latest`,
          guest: { cpu_kind: "shared", cpus: 2, memory_mb: 1536 },
          auto_start: true,
          auto_stop: "off",
          restart: { policy: "always" },
          env,
          mounts: [{ volume: args.volumeId, path: "/data" }],
          services: [
            {
              protocol: "tcp",
              internal_port: 3000,
              auto_start_machines: true,
              auto_stop_machines: "off",
              ports: [
                { port: 443, handlers: ["tls", "http"] },
                { port: 80, handlers: ["http"] },
              ],
              checks: [
                {
                  type: "http",
                  port: 3000,
                  method: "GET",
                  path: "/readyz",
                  interval: "10s",
                  timeout: "5s",
                },
              ],
            },
          ],
        },
      }),
    });

    return result.id;
  }

  async machineExists(machineId: string) {
    try {
      const res = await fetch(`${FLY_API_BASE}/apps/${FLY_APP_NAME}/machines/${machineId}`, {
        headers: { Authorization: `Bearer ${FLY_API_TOKEN}` },
      });

      if (!res.ok) return false;

      const machine = await res.json();

      return machine.state !== "destroyed";
    } catch {
      return false;
    }
  }

  async stopMachine(machineId: string) {
    await this.flyApiFetch(`/apps/${FLY_APP_NAME}/machines/${machineId}/stop`, {
      method: "POST",
    });
  }

  async destroyMachine(machineId: string) {
    await this.flyApiFetch(`/apps/${FLY_APP_NAME}/machines/${machineId}?force=true`, {
      method: "DELETE",
    });
  }

  async destroyVolume(volumeId: string) {
    for (let attempt = 1; attempt <= DESTROY_VOLUME_MAX_ATTEMPTS; attempt++) {
      try {
        await this.flyApiFetch(`/apps/${FLY_APP_NAME}/volumes/${volumeId}`, {
          method: "DELETE",
        });
        return;
      } catch (error) {
        if (attempt === DESTROY_VOLUME_MAX_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, DESTROY_VOLUME_RETRY_DELAY_MS));
      }
    }
  }

  async setEnvironmentVariable(args: { machineId: string; key: string; value: string }): Promise<void> {
    const machine = await this.flyApiFetch(`/apps/${FLY_APP_NAME}/machines/${args.machineId}`);
    const machineRecord = asRecord(machine);
    const config = asRecord(machineRecord?.config);
    if (!config) throw new Error("Machine config not found");

    const env = asRecord(config.env) ?? {};
    const nextConfig = {
      ...config,
      env: {
        ...env,
        [args.key]: args.value,
      },
    };

    await this.flyApiFetch(`/apps/${FLY_APP_NAME}/machines/${args.machineId}`, {
      method: "POST",
      body: JSON.stringify({
        config: nextConfig,
      }),
    });
  }

  async checkHealth(args: { machineId: string; gatewayToken: string }): Promise<boolean> {
    try {
      const res = await fetch(`${AGENT_BASE_URL}/readyz`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${args.gatewayToken}`,
          "fly-force-instance-id": args.machineId,
        },
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  private async flyApiFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${FLY_API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fly API error ${res.status}: ${body}`);
    }

    if (res.status === 204) return null;

    return res.json();
  }
}
