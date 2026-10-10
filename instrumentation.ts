// Storage-steward execution is intentionally owned by scripts/start-all.js.
// Keeping background work out of Next.js instrumentation prevents duplicate
// worker instances when Next.js creates multiple server runtimes.
export async function register() {}
