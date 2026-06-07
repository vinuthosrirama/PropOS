/**
 * imsg Transport
 *
 * Sends iMessage/SMS via the imsg CLI which drives macOS Messages.app
 * over its public AppleScript surface. Messages appear from the agent's
 * real iPhone number (SMS relay) or Apple ID (iMessage blue bubble).
 *
 * Setup (one-time, ~5 min):
 *   1. brew install steipete/tap/imsg
 *   2. Grant Full Disk Access to Terminal in System Settings
 *   3. Open Messages.app — confirm SMS relay is enabled:
 *      iPhone: Settings > Messages > Text Message Forwarding > your Mac ON
 *      Mac: Messages > Settings > iMessage > Enable Messages in iCloud ON
 *   4. Add to server/.env:
 *        SMS_TRANSPORT=imsg
 *
 * No credentials required — uses the signed-in Apple ID.
 * GitHub: https://github.com/openclaw/imsg
 */

import { exec } from "child_process"
import { promisify } from "util"
import { watch } from "fs"
import { homedir } from "os"
import path from "path"

const execAsync = promisify(exec)

// Validate IMSG_BIN to prevent shell injection via env var.
// Only allow absolute paths containing alphanumerics, slashes, hyphens and dots.
const rawBin = process.env.IMSG_BIN ?? "/opt/homebrew/bin/imsg"
const IMSG_BIN = /^[a-zA-Z0-9/_.-]+$/.test(rawBin) ? rawBin : "/opt/homebrew/bin/imsg"
const CHAT_DB  = path.join(homedir(), "Library/Messages/chat.db")

export function imsgConfigured(): boolean {
  return process.env.SMS_TRANSPORT === "imsg"
}

/**
 * Send a message via imsg CLI.
 */
export async function sendViaImsg(
  to: string,
  body: string,
): Promise<{ sid: string; testMode: boolean }> {
  const testPhone  = process.env.TEST_RECIPIENT_PHONE?.trim()
  const actualTo   = testPhone ?? to
  const actualBody = testPhone ? `[TEST to ${to}]\n${body}` : body

  // Sanitise body: escape chars that would break the shell argument
  const safeBody = actualBody
    .replace(/\\/g, "\\\\")
    .replace(/"/g,  '\\"')
    .replace(/`/g,  "\\`")
    .replace(/\$/g, "\\$")

  const safeNumber = actualTo.startsWith("+")
    ? actualTo
    : "+" + actualTo.replace(/\D/g, "")

  const cmd = `${IMSG_BIN} send "${safeNumber}" "${safeBody}"`
  const { stdout, stderr } = await execAsync(cmd, { timeout: 15_000 })

  if (stderr?.toLowerCase().includes("error")) {
    throw new Error(`imsg send error: ${stderr.trim()}`)
  }

  const guid = stdout.trim() || `imsg-${Date.now()}`
  return { sid: guid, testMode: !!testPhone }
}

/**
 * Check imsg binary is present and responding.
 */
export async function pingImsg(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await execAsync(`${IMSG_BIN} --version`, { timeout: 5_000 })
    return { ok: true, version: stdout.trim() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface ImsgIncoming {
  from:    string
  body:    string
  isGroup: boolean
  rowid:   number
}

/**
 * Watch for incoming messages by polling chat.db + fs.watch fallback.
 * Returns a cleanup function to stop watching.
 *
 * Requires Full Disk Access for the Node.js process in System Settings.
 */
export function watchIncomingImsg(
  onMessage: (msg: ImsgIncoming) => void,
): () => void {
  let lastRowId = -1
  let polling: ReturnType<typeof setInterval> | null = null

  const poll = async () => {
    try {
      const { stdout } = await execAsync(
        `${IMSG_BIN} chats --json 2>/dev/null | head -c 32768`,
        { timeout: 10_000 },
      )
      const chats = JSON.parse(stdout) as Array<{
        guid: string
        lastMessage?: { rowid: number; isFromMe: boolean; text: string; handle: string }
      }>

      for (const chat of chats) {
        const lm = chat.lastMessage
        if (!lm || lm.isFromMe || lm.rowid <= lastRowId) continue
        lastRowId = Math.max(lastRowId, lm.rowid)
        onMessage({
          from:    lm.handle,
          body:    lm.text,
          isGroup: chat.guid.includes(";+;"),
          rowid:   lm.rowid,
        })
      }
    } catch {
      // silent — chat.db may be locked or Full Disk Access not granted
    }
  }

  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(CHAT_DB, () => { void poll() })
  } catch {
    // Full Disk Access not granted — polling only
  }

  polling = setInterval(() => { void poll() }, 30_000)
  void poll()

  return () => {
    watcher?.close()
    if (polling) clearInterval(polling)
  }
}
