// Next.js 15 uses the middleware.ts file convention. Keep the implementation
// in proxy.ts so the auth logic remains centralized while this adapter makes
// the protection layer active on Render and other Next.js 15 hosts.
export { proxy as middleware, config } from './proxy'
