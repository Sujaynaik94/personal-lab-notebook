# Personal Lab Notebook

A single-file lab notebook for the bench, in your browser. No server, no login, no install.

- **Protocols**: sections, steps, timers, reagents, tables, thermal programs, images, versions, bench sheets, export to PDF / Word / Markdown / HTML.
- **Notebook**: notebooks > sections > pages, rich text, equations, attachments, signing and witnessing, revisions.
- **Planner**: calendar with multi-day plans, reminders, equipment clashes, `.ics` export.
- **Inventory**, **bio calculators** (dilutions, plates, pooling), global search, backup and merge-restore.

## Use it

Open the live app at https://sujaynaik94.github.io/personal-lab-notebook/, or download `index.html` and open it in a browser (Chrome, Edge or Firefox). On first run, click **Load example protocol** on the Protocols tab to get an example protocol and an example notebook page. Delete them when you no longer need them.

Hosting it (for example GitHub Pages) works too; the file is the whole app.

## Your data

Everything is stored in your browser (IndexedDB) for that copy of the file, under that file path or URL. **Nothing is uploaded.** Clearing site data deletes it, so use the **Back up now** button regularly (a backup file, or an auto-backup folder in Chrome/Edge). Each copy of the file has its own separate data; use backup and merge-restore to move data between copies.

## Build from source

```
python3 build.py
```
This joins `src/app.html`, `src/shim.js` and `vendor/jspdf.umd.min.js` into `index.html`.

## Known limits

- Tested in headless Chromium only. Safari, Firefox and phones have not been tested on real devices.
- Equations are typeset in Word (OMML) but this has not been checked in real Word. Inline equation text exports as plain linear text; display equations are typeset in PDF and Word.
- Merge-restore cannot detect deletions, and if both copies changed the same item the older edit is lost.
- Planner reminders only fire while the page is open; use the `.ics` export for calendar reminders.
- Not a validated electronic-records system. The signing feature records a name and time in your own browser, so it is not a legally binding signature.
- Single user per browser. There is no sharing between people.

## Licence

MIT, see `LICENSE`. Third-party material: see `NOTICE.md`.
