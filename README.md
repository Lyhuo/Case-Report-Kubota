# Case Report Dashboard

A static web dashboard for customer case reports, built with HTML, CSS and JavaScript and backed by Firebase Cloud Firestore. It runs on GitHub Pages with no build step.

## Features
- Year and month filters, plus status, case type, province and text search
- KPI tiles with trend lines, 3D monthly bar chart with labels, 3D pie charts (case type, channel, product type)
- Case table with sorting, paging, full case description view
- Add, edit and delete cases (saved to Firestore, shared by everyone)
- Upload Excel (.xlsx, .xls, .csv) to add/update or replace the data
- Export the filtered cases to CSV
- "Synced" date and time shown in the header and footer

## Project structure
```
index.html              page markup
css/styles.css          all styles
js/app.js               dashboard logic (filters, charts, table, editing, upload)
js/firebase.js          Firestore connection (exposes window.CaseServices)
js/firebase-config.js   Firebase project settings
data/data.json          3,382 cases converted from Case_Report.xlsx
data/meta.json          source file name and synced date
assets/images/          background picture
firestore.rules         Firestore security rules
```

## Run locally
The page loads `data/data.json` and ES modules, so it must be served over HTTP (opening the file directly will not work).

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages
```bash
git init
git add .
git commit -m "Case Report Dashboard"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```
Then on GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch > Branch: main, folder / (root) > Save**. The site appears at `https://<your-user>.github.io/<your-repo>/`.

## Firebase setup
1. In the Firebase console, open project `case-report-26aae`, then **Build > Firestore Database > Create database**.
2. Open **Rules**, paste the contents of `firestore.rules`, and press **Publish**.
3. In **Authentication > Settings > Authorized domains**, add `<your-user>.github.io`.

Collections the page uses:
- `edits`: one document per edited, added or deleted case
- `ds_<id>`: chunks of an uploaded Excel dataset
- `meta/dataset`: points to the active upload and holds the synced date

### Security
The Firebase key in `js/firebase-config.js` is public by design, so the rules decide who can change data. The bundled rules are open for testing. For real use, add Firebase Authentication and change `if true` to `if request.auth != null`.

## Updating the data
Use **Upload Excel** in the page (columns: Case Number, Case Type, Case Origin, Opened Date, Status, Account Name, Province (ID), Product Type, Product, Shop Name, Case Description, Related Section, Created By). Choose "Add and update" to merge by case number, or "Replace everything".
