/** Tiny in-memory cache with expiry and a size cap, so it can never grow without bound. */
class TtlCache {
  constructor(ttlMs, maxEntries = 500) {
    this.ttl = ttlMs;
    this.max = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { value, expires: Date.now() + this.ttl });
  }
}

module.exports = { TtlCache };
