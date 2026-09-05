# Fari Money Assistant v3

Created by Fari-RV ♥

## One-time Supabase setup
1. Open your existing Supabase project.
2. Go to SQL Editor → New query.
3. Paste the contents of `supabase-setup.sql` and click **Run** once.
4. If email confirmation is enabled under Authentication, confirm the signup email before first login.

## GitHub Pages upload
Upload the files in this ZIP directly to the root of the `fari-money-assistant` repository. Do not put them inside another folder.

Recommended Pages setting: Settings → Pages → Deploy from a branch → `main` → `/(root)`.

## Important cache note
This version uses a new cache identifier and network-first page loading to replace older GitHub Pages/PWA versions. After deployment, refresh once. If an old installed PWA is still open, close it fully and reopen.
