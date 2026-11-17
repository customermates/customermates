import type { ComposeModelCall } from "./compose-model-caller";

import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { generateStructuredObject } from "@/ee/agent-chat/structured-model-call";

import { ComposeModelCaller } from "./compose-model-caller";

export class HostedComposeModelCaller extends ComposeModelCaller {
  async call<T>(call: ComposeModelCall<T>): Promise<T | null> {
    const result = await generateStructuredObject({
      label: "Automation composer",
      model: AGENT_MODELS.setupDrafting,
      schema: call.schema,
      system: call.system,
      prompt: call.prompt,
      retrySchemaCompilation: true,
    });
    return result.output;
  }
}
