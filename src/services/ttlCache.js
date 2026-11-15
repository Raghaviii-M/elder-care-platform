class TtlCache {
  constructor(ttl = 60000, maxSize = Infinity) {
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) return undefined;

    if (Date.now() >= item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key, value) {
    // Replace an existing entry without unnecessarily evicting another.
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Remove the oldest entry when the cache is full.
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = { TtlCache };
