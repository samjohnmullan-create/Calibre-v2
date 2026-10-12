# Calibre v2

Clean rebuild of Calibre & Co.

## Phase 0C scope

This repository starts with authentication/bootstrap only. It intentionally contains no legacy Job model, Workbench, Passport UI, or browser-owned state.

### Backend

Supabase project: `zmhbrqkzvgajmvhhorba` (Sydney / `ap-southeast-2`)

The frontend uses the Supabase **publishable** key. No secret/service-role key belongs in this repository.

## Local development

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## First acceptance flow

1. Open the deployed app.
2. Enter email and request a sign-in link.
3. Follow the link back to the app.
4. Confirm Auth + Database show Passed.
5. Click **Initialize Calibre & Co.**
6. Confirm Workspace shows Ready.

Only after that do we seed the Oris and continue the Phase 0C lifecycle test.
