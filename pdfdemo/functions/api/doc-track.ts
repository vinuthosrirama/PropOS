import { storeBatch, type Env } from "./_shared"

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  return storeBatch(request, env)
}
