import type { InteractiveSession } from "@/features/auth/auth.service";
import type { OperatorActor } from "@/core/decorators/operator-context";

export abstract class OperatorAccessRepo {
  abstract findAuthorizedActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null>;
  abstract findAuthorizedIntegrationActorUnscoped(session: InteractiveSession): Promise<OperatorActor | null>;
}
