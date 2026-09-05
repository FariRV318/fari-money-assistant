# Fari Money Assistant v4

Created by Fari-RV ♥

## What changed
- Premium mobile-first UI matching the approved teal / pink / gold mockup style
- Bottom mobile navigation and compact app-like layouts
- New gold-F finance icon set with versioned filenames to avoid stale PWA icon caches
- Preferred full-payment month is now treated as a real planning deadline
- Whole-payment friend/family debts reserve money before the selected target month
- If the selected target cannot be funded, the assistant keeps the chosen month and shows the shortfall instead of silently moving it later
- Supabase login and cloud sync retained

## GitHub Pages
Upload all files in this folder directly to the repository root.

## Supabase
The included `supabase-setup.sql` is the same setup required for cloud sync. Run it once if it has not already been run.

## Important icon refresh
If an older Fari Money Assistant PWA is already installed on Android, uninstall the old installed app after deploying v4, open the GitHub Pages site again, and install it again. Android launchers may keep an old PWA icon even after the manifest updates.
