const { spawn } = require('node:child_process');

const children = [];
const env = { ...process.env, EMBEDDED_SPARTAN: 'true' };

function launch(command, args, label, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[START-ALL] ${label} exited code=${code} signal=${signal || 'none'}`);
      shutdown(code || 1);
    }
  });
  child.on('error', (error) => {
    console.error(`[START-ALL] ${label} failed: ${error.message}`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code), 1500).unref();
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

console.log('[START-ALL] Starting Spartan web + Discord bot as one Render service');

launch(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0'], 'Next.js');
launch(process.execPath, ['node_modules/utopia-nexus-bot/bot/bot.js'], 'Discord bot');
