require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const logger = require("./logger");

let supabase = null;

// Spartan West uses the same canonical Supabase configuration as the Next.js
// server. Keep legacy names only as fallbacks so an old project URL/key cannot
// silently win after a Supabase migration.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  logger.info("Supabase initialized");
} else {
  logger.info("Supabase credentials missing - disabled");
}

module.exports = {
  getClient() {
    return supabase;
  },

  isConnected() {
    return supabase !== null;
  },
};
