#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * One-shot CLI helper to register the Telegram webhook URL with the Bot API
 * and push the slash-command catalogue. Run once after each prod deploy where
 * the webhook URL or commands changed:
 *
 *   TELEGRAM_BOT_TOKEN=... \
 *   TELEGRAM_WEBHOOK_SECRET=... \
 *   TELEGRAM_WEBHOOK_URL=https://clara.trefolio.com/api/webhooks/telegram \
 *   node scripts/setup-telegram-webhook.mjs
 *
 * Loads `.env.local` first so local runs don't need to repeat envs in the
 * shell. Exits non-zero on any Telegram error so CI can gate deploys on it
 * if you wire it up later.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv(file) {
  try {
    const raw = readFileSync(join(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* file may not exist; ignore */
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.TELEGRAM_WEBHOOK_URL;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}
if (!secret) {
  console.error("Missing TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}
if (!url) {
  console.error(
    "Missing TELEGRAM_WEBHOOK_URL (e.g. https://clara.trefolio.com/api/webhooks/telegram)",
  );
  process.exit(1);
}

const COMMANDS = [
  { command: "start", description: "Empezar / Start chat with Clara" },
  { command: "help", description: "Ayuda / Help" },
  { command: "menu", description: "Mostrar opciones / Show quick actions" },
  { command: "unlink", description: "Desvincular cuenta / Unlink account" },
];

async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[telegram.${method}] failed:`, data);
    process.exit(1);
  }
  return data.result;
}

console.log(`[telegram] Registering webhook → ${url}`);
await callTelegram("setWebhook", {
  url,
  secret_token: secret,
  allowed_updates: ["message", "edited_message", "callback_query"],
  drop_pending_updates: false,
});
console.log("[telegram] setWebhook ok");

await callTelegram("setMyCommands", { commands: COMMANDS });
console.log("[telegram] setMyCommands ok");

const info = await callTelegram("getWebhookInfo", {});
console.log("[telegram] getWebhookInfo →", info);
