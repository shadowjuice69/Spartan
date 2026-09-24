const { execFileSync } = require('node:child_process');

const BOT_PACKAGE = 'github:shadowjuice69/utopia-nexus#c9e557c12b638df9d958bf474df4a37ba979355c';
console.log('[SPARTAN] Installing pinned Nexus bot package...');
execFileSync('npm', ['install', '--no-save', '--no-package-lock', '--ignore-scripts', BOT_PACKAGE], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
console.log('[SPARTAN] Nexus bot package installed.');
