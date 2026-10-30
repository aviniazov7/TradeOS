// Vitest stand-in for `cloudflare:workers`. The Cloudflare Vite plugin also
// imports these three base classes while classifying Worker exports, so each
// one has to be a real constructor. Production builds do not use this file.
export class WorkerEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class WorkflowEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
