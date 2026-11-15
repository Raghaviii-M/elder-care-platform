class MemoryRepo {
  constructor() {
    this.circles = new Map();
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
}

module.exports = { MemoryRepo };