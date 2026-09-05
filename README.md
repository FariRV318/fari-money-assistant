Fari Money Assistant FINAL v13 — Direct Auth Repair

This build removes the Supabase CDN dependency and disables service-worker caching.
Login uses a direct Supabase Auth request with the project publishable key, an 8-second connectivity check, and a 12-second login timeout.
If authentication fails, the exact Supabase/network error is shown on the login screen.

Upload ALL files in this ZIP directly to the root of the fari-money-assistant GitHub repository.
