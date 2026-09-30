require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const logger = require("./logger");

let supabase = null;

// Spartan West uses only the current Supabase project credentials.
// Do not fall back to legacy/old-system environment names.
const CANONICAL_SUPABASE_PROJECT_REF = 'vciskcfxfhycslygdycy';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

function assertSupabaseTarget() {
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  const actual = new URL(supabaseUrl).hostname.split('.')[0];
  const expected = process.env.SPARTAN_SUPABASE_PROJECT_REF || CANONICAL_SUPABASE_PROJECT_REF;
  if (actual !== expected || actual !== CANONICAL_SUPABASE_PROJECT_REF) {
    throw new Error(`Spartan Supabase target mismatch: expected ${CANONICAL_SUPABASE_PROJECT_REF}, got ${actual}`);
  }
  if (supabaseKey) {
    const parts = supabaseKey.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.ref && payload.ref !== CANONICAL_SUPABASE_PROJECT_REF) {
          throw new Error(`Spartan Supabase credential mismatch: service key belongs to ${payload.ref}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Spartan Supabase')) throw error;
      }
    }
  }
}

if (supabaseUrl && supabaseKey) {
  try { assertSupabaseTarget(); } catch (error) {
    logger.error(error.message);
    throw error;
  }
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
