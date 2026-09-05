# Fari Money Assistant v11

This build fixes Supabase login for the new `sb_publishable_...` key format by sending the publishable key only as the `apikey` header before authentication. It also adds a mobile-safe connection timeout/retry and a visible error instead of leaving the screen on “Signing you in…”.

Upload every file in this folder to the root of the GitHub Pages repository, replacing the old build.


V12 LOGIN REPAIR
- Uses official @supabase/supabase-js client first, matching the working Trading Dashboard approach.
- REST fallback remains available if the SDK CDN cannot load.
- Login has an 18-second timeout and visible error instead of hanging forever.
- Existing sessions open the app immediately; cloud data loads afterward.
- Old service-worker caches are cleared once to prevent stale login code.
