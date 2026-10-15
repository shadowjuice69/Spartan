'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const venv = path.join(root, '.venv');
const python = path.join(venv, 'bin', 'python');
const requirements = path.join(root, 'requirements.txt');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + ' exited with status ' + result.status);
}

if (fs.existsSync(python)) {
  const check = spawnSync(python, ['-c', 'import pdfplumber'], { cwd: root, stdio: 'ignore' });
  if (check.status === 0) process.exit(0);
}

const systemPython = process.env.PYTHON || 'python3';
if (!fs.existsSync(venv)) run(systemPython, ['-m', 'venv', venv]);
run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements]);
