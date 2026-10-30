// One Durable Object per user. SQLite-backed so it runs on the Workers Free
// plan (KV-backed objects are paid-only). check + increment happen inside
// createQuotaGate's lock, including the one-time import of the legacy
// aiq:{uid} KV document, so concurrent requests cannot share a stale read.

import { DurableObject } from 'cloudflare:workers';
import { createQuotaGate } from './aiQuotaActor.js';

export class AiQuotaDO extends DurableObject {
  #seeded = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.gate = createQuotaGate({
      read: () => this.#read(),
      write: (doc) => this.#write(doc),
      seed: (uid) => this.#seed(uid),
      clear: () => this.#clear(),
    });
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS quota (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        doc TEXT NOT NULL
      )`);
    });
  }

  charge(input) { return this.gate.charge(input); }
  refund(input) { return this.gate.refund(input); }
  usage(input) { return this.gate.usage(input); }
  wipe() { return this.gate.wipe(); }

  #read() {
    const rows = this.ctx.storage.sql.exec('SELECT doc FROM quota WHERE id = 1').toArray();
    if (!rows.length || typeof rows[0]?.doc !== 'string') return null;
    try {
      const parsed = JSON.parse(rows[0].doc);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  #write(doc) {
    this.ctx.storage.sql.exec(
      'INSERT INTO quota (id, doc) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc',
      JSON.stringify(doc),
    );
  }

  async #seed(uid) {
    if (this.#seeded) return null;
    if (this.#read()) {
      this.#seeded = true;
      return null;
    }
    if (!uid || !this.env?.ALERTS_KV?.get) {
      this.#seeded = true;
      return null;
    }
    let fromKv = null;
    try {
      fromKv = await this.env.ALERTS_KV.get(`aiq:${uid}`, 'json');
    } catch (e) {
      // Don't mark seeded: the next request retries the import instead of
      // opening a fresh counter over a KV blip.
      console.error('ai quota seed', e?.message || e);
      return { error: true };
    }
    if (!this.#read() && fromKv && typeof fromKv === 'object' && !Array.isArray(fromKv)) {
      this.#write(fromKv);
    }
    this.#seeded = true;
    return null;
  }

  #clear() {
    this.ctx.storage.sql.exec('DELETE FROM quota');
    // Account deletion. Don't re-import the KV mirror we're about to drop.
    this.#seeded = true;
  }
}
