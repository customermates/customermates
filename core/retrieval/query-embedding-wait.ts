export class QueryEmbeddingWait {
  private state: "waiting" | "claimed" | "abandoned" = "waiting";

  claim(): boolean {
    if (this.state === "waiting") this.state = "claimed";
    return this.state === "claimed";
  }

  abandon(): boolean {
    if (this.state === "waiting") this.state = "abandoned";
    return this.state === "abandoned";
  }
}
