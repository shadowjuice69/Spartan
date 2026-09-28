# Spartan Universal Capture 4.0.5

Chrome client generated from the same capture engine as the Tampermonkey 4.0.5 client.

Fixed: Throne pages were being misclassified as Military because the fallback text-based page detector checked for "throne room" (a phrase that never appears on the real page) after already checking for "military" (which always matches, since every page has a persistent Military nav link).
