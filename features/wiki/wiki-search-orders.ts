import type { WikiSearchOrder } from "./search-wiki-pages.interactor";
import { WIKI_SEARCH_ORDER_LIMIT } from "./search-wiki-pages.interactor";

export class WikiSearchOrders {
  private orders = new Map<string, WikiSearchOrder>();

  get(key: string, now: number): WikiSearchOrder | undefined {
    const order = this.orders.get(key);
    if (!order) return undefined;
    this.orders.delete(key);
    if (order.expiresAt <= now) return undefined;
    this.orders.set(key, order);
    return order;
  }

  set(key: string, order: WikiSearchOrder) {
    this.orders.delete(key);
    this.orders.set(key, order);
    const oldest = this.orders.keys().next().value;
    if (this.orders.size > WIKI_SEARCH_ORDER_LIMIT && oldest !== undefined) this.orders.delete(oldest);
  }
}
