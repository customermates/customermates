import type { DomainEventHandlers } from "@/features/event/domain-event.listener";
import type { WikiSemanticIndexScheduler } from "@/features/wiki/wiki-semantic-index-scheduler";
import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export class WikiSemanticIndexListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(private scheduler: WikiSemanticIndexScheduler) {
    super();

    this.handlers = {
      [DomainEvent.WIKI_PAGE_CREATED]: () => this.scheduler.schedule(),
      [DomainEvent.WIKI_PAGE_UPDATED]: () => this.scheduler.schedule(),
    };
  }
}
