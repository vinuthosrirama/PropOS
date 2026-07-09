import type { Request, Response, NextFunction, RequestHandler } from "express"

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

/**
 * Wrap an async route handler so a rejected promise becomes a normal HTTP
 * response instead of a process-level unhandledRejection. Express 4 does not
 * forward async rejections to the error middleware; without this wrapper the
 * A11 process guard in server/index.ts keeps the server alive but the client
 * request HANGS forever (spinner never resolves), which is the worst possible
 * failure mode mid-demo.
 *
 * fallbackStatus 500 by default. Pass 204 for demo endpoints whose clients
 * already treat "no content" as "use built-in fallback data" (see
 * src/lib/agentDemoFetcher.ts), so a dead database silently degrades to the
 * hardcoded demo dataset and the demo keeps running.
 */
export function guard(handler: AsyncHandler, fallbackStatus = 500): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((err: unknown) => {
      console.error(
        `[route] ${req.method} ${req.originalUrl} failed:`,
        err instanceof Error ? err.message : err,
      )
      if (res.headersSent) return
      if (fallbackStatus === 204) {
        res.sendStatus(204)
      } else {
        res.status(fallbackStatus).json({ error: "Internal server error" })
      }
    })
  }
}
