require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const logger = require("./logger");

let supabase = null;

// Spartan West uses only the current Supabase project credentials.
// Do not fall back to legacy/old-system environment names.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

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
  logger.error("Supabase credentials missing - Spartan bot database access disabled");
}

module.exports = {
  getClient() {
    return supabase;
  },

  isConnected() {
    return supabase !== null;
  },
};
