const crypto = require('crypto');

class MemoryRepo {
  constructor() {
    this.circles = new Map();
    this.items = new Map();
  }

  _bucket(circleId, kind) {
    const key = `${circleId}/${kind}`;
    if (!this.items.has(key)) this.items.set(key, new Map());
    return this.items.get(key);
  }

  async createCircle(circle) {
    this.circles.set(circle.id, circle);
    return circle;
  }

  async getCircle(id) {
    return this.circles.get(id) || null;
  }

  async listCircles() {
    return [...this.circles.values()];
  }

  async addItem(circleId, kind, data) {
    const item = { ...data, id: crypto.randomUUID() };
    this._bucket(circleId, kind).set(item.id, item);
    return item;
  }

  async setItem(circleId, kind, id, data) {
    const item = { ...data, id };
    this._bucket(circleId, kind).set(id, item);
    return item;
  }

  async getItem(circleId, kind, id) {
    return this._bucket(circleId, kind).get(id) || null;
  }

  async listItems(circleId, kind, { sinceDate } = {}) {
    const all = [...this._bucket(circleId, kind).values()];
    return sinceDate ? all.filter((i) => i.date >= sinceDate) : all;
  }

  async updateItem(circleId, kind, id, patch) {
    const bucket = this._bucket(circleId, kind);
    const current = bucket.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    bucket.set(id, next);
    return next;
  }

  async removeItem(circleId, kind, id) {
    return this._bucket(circleId, kind).delete(id);
  }
}

module.exports = { MemoryRepo };
