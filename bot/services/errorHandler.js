const logger = require("./logger");

const attachedClients = new WeakSet();
let processHandlersAttached = false;

function toMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.stack || error.message || String(error);
}

function userMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;
  const raw = typeof error === "string" ? error : error.message;
  const message = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|supabase|\bnetwork\b/i.test(message)) {
    return "A backend service is temporarily unavailable. Try again shortly.";
  }
  if (message.length > 300) return message.slice(0, 297) + "...";
  return message;
}

function handle(error, context = {}) {
  logger.error(toMessage(error), context);
}

function attach(client) {
  if (client && typeof client.on === "function" && !attachedClients.has(client)) {
    attachedClients.add(client);
    client.on("error", error => handle(error, { source: "discord.client" }));
  }

  if (processHandlersAttached) return;
  processHandlersAttached = true;

  process.on("unhandledRejection", reason => {
    handle(reason, { source: "process.unhandledRejection" });
  });

  process.on("uncaughtException", error => {
    handle(error, { source: "process.uncaughtException", fatal: true });
    // Exit rather than continue in an unknown state; Render can restart the process.
    process.exit(1);
  });
}

module.exports = { handle, userMessage, attach, toMessage };
