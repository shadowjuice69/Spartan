const SECRET_KEY = /(token|secret|password|authorization|api.?key|service.?role|private.?key)/i;

function redact(value, key = "", seen = new WeakSet()) {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => redact(item, "", seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey, redact(childValue, childKey, seen),
  ]));
}

function safeContext(context) {
  if (context == null) return "";
  try {
    const value = typeof context === "object" ? redact(context) : context;
    return " " + (typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    return " [context unavailable]";
  }
}

function write(level, message, context) {
  if (level === "debug" && process.env.SPARTAN_DEBUG !== "true") return;
  const timestamp = new Date().toISOString();
  const text = message instanceof Error ? (message.stack || message.message) : String(message == null ? "" : message);
  const line = `[${timestamp}] [${level.toUpperCase()}] ${text}${safeContext(context)}`;
  const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  output(line);
}

module.exports = {
  error: (message, context) => write("error", message, context),
  warn: (message, context) => write("warn", message, context),
  info: (message, context) => write("info", message, context),
  debug: (message, context) => write("debug", message, context),
};
