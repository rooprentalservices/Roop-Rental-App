# Roop Rental Services — Rental Management PWA

## Install on your phone (GitHub Pages)
1. Create a new GitHub repo (e.g. `roop-rental-app`).
2. Upload all 6 files from this folder (`index.html`, `app.js`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`) to the root of the repo.
3. Go to repo **Settings → Pages → Source**, select the `main` branch and `/ (root)` folder, then Save.
4. Wait 1-2 minutes, then open the link GitHub gives you (looks like `https://yourusername.github.io/roop-rental-app/`) in Chrome on your phone.
5. Tap the Chrome menu (⋮) → **Add to Home screen** → Install. It now opens like a normal app icon, works offline.

## What's included
- Dashboard with live stats (active rentals, due today, overdue, pending payments, monthly revenue)
- Rental entry with unlimited items per rental, auto-calculated rent/day × qty × days
- Customer auto-save + autofill by name, full rental history per customer
- Global search + filters (active/today/pending/returned/archived/trash) + sorting
- Status badges: On Rent (green), Partial Return (yellow), Returned (red), Payment Pending (brown), Archived (grey)
- WhatsApp share (pre-filled message) and a printable Invoice (opens print dialog — choose "Save as PDF")
- KYC uploads (camera or gallery/PDF) stored on-device
- Payment tracking (advance + additional payments, multiple modes)
- Archive, Trash (soft delete/restore)
- Reports: totals, monthly revenue chart, top customers, most rented items
- Settings: business details, dark mode, 4-digit PIN lock, backup/restore

## About backup
All data stays only on this phone (IndexedDB) — nothing is uploaded anywhere. Use **Settings → Export Backup** regularly to download a `.json` file; keep a copy on WhatsApp-to-self or Google Drive manually. **Import Backup** restores from that file (replaces current data). A direct Google Drive auto-sync wasn't included since it needs a paid Google Cloud OAuth setup — this manual export/import covers the same need for free.

## Notes
- "Pick from Contacts" only works on Chrome versions that support the Contact Picker API — if it doesn't appear, just type the customer's number manually.
- Everything works fully offline once installed.
