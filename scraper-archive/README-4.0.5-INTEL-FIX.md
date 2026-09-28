# Spartan Universal Capture 4.0.5 — Intel Fix Archive

This directory preserves the fixed 4.0.5 scraper build.

## Fixed artifacts
- `spartan-universal-capture-4.0.5-intel-fixed.user.txt`
- `spartan-universal-capture-chrome-4.0.5-sparta-west-v4-fixed.zip`

## Intel fix
The Intel site uses a virtualized MUI DataGrid. The fixed scraper scrolls the grid vertically and horizontally, merges virtualized rows by stable province ID, reads the authoritative `location` (Kd #) column, and refuses to transmit incomplete grids.

The Chrome ZIP contains exactly four root files: `content.js`, `background.js`, `manifest.json`, and `README.md`.
