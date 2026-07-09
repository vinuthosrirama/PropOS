import { storeBatch, type Env } from "../_shared"

// navigator.sendBeacon posts text/plain; body is the same JSON batch.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  return storeBatch(request, env)
}
