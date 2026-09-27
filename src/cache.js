export class TtlCache {
  constructor(maxEntries = 500) { this.maxEntries = maxEntries; this.values = new Map(); }
  get(key) {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (item.expires <= Date.now()) { this.values.delete(key); return undefined; }
    this.values.delete(key); this.values.set(key, item);
    return item.value;
  }
  set(key, value, seconds) {
    if (seconds <= 0) return;
    this.values.delete(key);
    this.values.set(key, { value, expires: Date.now() + seconds * 1000 });
    while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value);
  }
}

export async function mapLimit(items, limit, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = await fn(items[index]); } catch { output[index] = []; }
    }
  }));
  return output.flat();
}
