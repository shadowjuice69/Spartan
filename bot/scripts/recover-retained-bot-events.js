#!/usr/bin/env node
require('dotenv').config();

const supabaseService = require('../services/supabase');
const { recoverAllowlistedBotEvents } = require('../services/retainedBotEventRecovery');

async function main() {
  const execute = process.argv.includes('--execute');
  if (execute && process.env.SPARTAN_RECOVER_BOT_EVENTS !== '1') {
    throw new Error('Execution blocked: set SPARTAN_RECOVER_BOT_EVENTS=1 and pass --execute explicitly.');
  }

  const sb = supabaseService.getClient();
  if (!sb) throw new Error('Spartan Supabase client is unavailable.');

  const result = await recoverAllowlistedBotEvents(sb, { execute });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.rejected > 0) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(`Retained Bot Intel recovery failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
