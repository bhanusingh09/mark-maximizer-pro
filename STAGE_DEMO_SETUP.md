# Stage-demo setup

This version does not contain seed marksheets or fallback student rows. A record appears only after a CSV or PDF produced at least one parsed student row and both the source file and parsed rows were saved successfully.

## 1. Enable the backend in Lovable

Open the project in Lovable and enable **Lovable Cloud**. The app expects the environment variables Lovable/Supabase exposes to Vite:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

For a separate Supabase project, copy `.env.example` to `.env` locally and fill in those two public client values. Never put the service-role key in the frontend.

## 2. Apply the database migration

Apply `supabase/migrations/20260901000000_markmaxxer_persistence.sql` to the cloud database. It creates:

- `processing_runs` for uploaded marksheet metadata and review state;
- `mark_records` for parsed and faculty-corrected rows;
- a private `marksheets` storage bucket for source CSV/PDF files;
- row-level security policies that isolate every faculty account.

The migration contains no sample or seed data.

## 3. Authentication setting for a live stage demo

Email/password authentication is real. For the smoothest controlled stage demo, either create and confirm the presenter account before the event or temporarily disable email confirmation in the project's authentication settings. Do not use the removed browser-only demo login.

## 4. Supported files

- CSV: headers matching **Roll number**, **Student name**, and **Marks** (common aliases are accepted).
- PDF: searchable table text is preferred. Scanned PDFs use in-browser English OCR for up to 5 pages.
- PDFs are limited to 12 pages and all uploads to 10 MB for predictable demo performance.

If no student rows can be parsed, the app displays an error and saves nothing. It never inserts substitute names or marks.

## 5. Verify before presenting

```sh
npm install --no-package-lock
npm run verify
```

Then test this exact flow in the deployed app:

1. Sign in with the presenter account.
2. Upload `public/samples/clean-marksheet.csv` and verify that its rows appear.
3. Save a draft, sign out, sign back in, open **Records**, and reopen the draft.
4. Edit one mark, save, refresh the page, and confirm the edit remains.
5. Open **View source** and confirm the private source file loads.
6. Upload a clear PDF marksheet and confirm only rows visible in that PDF appear.
7. Upload an unrelated PDF and confirm the app rejects it without creating a record.
