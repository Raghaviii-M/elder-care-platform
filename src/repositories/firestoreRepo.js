const { Firestore } = require('@google-cloud/firestore');

class FirestoreRepo {
  constructor(db) {
    if (!db) {
      const options = { ignoreUndefinedProperties: true };
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (raw) {
        const sa = JSON.parse(raw);
        options.projectId = sa.project_id;
        options.credentials = { client_email: sa.client_email, private_key: sa.private_key };
      }
      db = new Firestore(options);
    }
    this.db = db;
  }

  _col(circleId, kind) {
    return this.db.collection('circles').doc(circleId).collection(kind);
  }

  async createCircle(circle) {
    await this.db.collection('circles').doc(circle.id).set(circle);
    return circle;
  }

  async getCircle(id) {
    const snap = await this.db.collection('circles').doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  async listCircles() {
    const snap = await this.db.collection('circles').get();
    return snap.docs.map((d) => d.data());
  }

  async addItem(circleId, kind, data) {
    const ref = this._col(circleId, kind).doc();
    const item = { ...data, id: ref.id };
    await ref.set(item);
    return item;
  }

  async setItem(circleId, kind, id, data) {
    const item = { ...data, id };
    await this._col(circleId, kind).doc(id).set(item);
    return item;
  }

  async getItem(circleId, kind, id) {
    const snap = await this._col(circleId, kind).doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  async listItems(circleId, kind, { sinceDate } = {}) {
    let query = this._col(circleId, kind);
    if (sinceDate) query = query.where('date', '>=', sinceDate);
    const snap = await query.get();
    return snap.docs.map((d) => d.data());
  }

  async updateItem(circleId, kind, id, patch) {
    const ref = this._col(circleId, kind).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.update(patch);
    return { ...snap.data(), ...patch };
  }

  async removeItem(circleId, kind, id) {
    const ref = this._col(circleId, kind).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
}

module.exports = { FirestoreRepo };
