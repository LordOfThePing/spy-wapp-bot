export class CooldownManager {
  private readonly memory = new Map<string, number>();

  take(key: string, cooldownMs: number): number {
    const now = Date.now();
    const previous = this.memory.get(key) ?? 0;
    const elapsed = now - previous;
    if (elapsed < cooldownMs) {
      return cooldownMs - elapsed;
    }
    this.memory.set(key, now);
    return 0;
  }
}
