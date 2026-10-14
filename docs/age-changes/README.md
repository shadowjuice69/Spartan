# Age Changes Source Documents

This directory is the canonical place to store source documents for Utopia age updates used by Spartan.

## Where to put files

- Put the proposed-changes PDF for an age in this directory.
- Keep the original filename where practical; otherwise use `UTOPIA_AGE_<AGE>_CHANGES.pdf`.
- Add future age documents here too, so the source history stays together.

Example:
```
docs/age-changes/
  README.md
  UTOPIA_AGE_117_PREFINAL_CHANGES.pdf
  UTOPIA_AGE_118_CHANGES.pdf
```

## Important workflow

1. Upload the source PDF here.
2. Spartan's parser/audit should extract the proposed changes and compare them against the previous age's baseline.
3. Review parser output and discrepancies before applying an age update.
4. Do not treat uploading a PDF as applying it to live rules. Only the explicit apply workflow changes active rules.
5. Keep the source documents as evidence for future audits. Do not overwrite an older age's source document with a newer age's PDF.

**Current task:** upload `UTOPIA_AGE_117_PREFINAL_CHANGES.pdf` into this directory for the Age 117 audit.
