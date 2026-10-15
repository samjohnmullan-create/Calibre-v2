# Calibre & Co.

**Canonical Calibre application.**

> **Product direction:** Calibre is the operating system for the workshop, inventory, research and resale business.

The original `CalibreOI` repository is retired. All active product development and production releases now originate from this repository.

## Production

Target production URL: `https://app.calibreco.com.au`

GitHub Pages deployment is built from `main` through `.github/workflows/deploy-pages.yml`.

## Source of truth

The canonical product/engineering plan is:

[`docs/CALIBRE_V2_MASTER_ROADMAP.md`](docs/CALIBRE_V2_MASTER_ROADMAP.md)

Update that roadmap when a phase is accepted, deferred, reordered or materially redesigned.

## Architecture

- Item is the permanent physical-object root.
- Work is separate and optional; an Item can have many Work records.
- Supabase is authoritative.
- No legacy `jobs`, `currentId`, or browser-owned master state.
- Internal data remains private; future public/customer pages use a sanitised projection.
- Evidence, confidence and history are preserved rather than replaced by guessed certainty.

## Backend

Supabase project: `zmhbrqkzvgajmvhhorba` (Sydney / `ap-southeast-2`).

The frontend uses the Supabase **publishable** key. No secret/service-role key belongs in this repository.

## Authentication

Calibre currently uses email OTP sign-in:

1. Enter the authorised email address.
2. Request a verification code.
3. Enter the **8-digit** code from the email.
4. The Supabase session is restored on subsequent visits until signed out/expired.

## Current product state — 15 October 2026

Current `main` includes:

- responsive phone + DeX/desktop shell;
- live Items workspace and Item editing;
- Workbench command-centre foundations;
- Bench Mode with session timing and quick capture;
- Pause / Resume / Remove from Bench lifecycle controls;
- structured measurements, Part Needs and workshop evidence;
- smart Bench exceptions and readiness checks;
- sourced Bench Knowledge tied to Passport movement data;
- native AudioWorklet Timegrapher with Work-linked timing checkpoints;
- Parts reservation, fit evidence, consumption and fulfilment;
- storage/location history and Needs Put-away;
- Item economics, Stock, Listings, Sales, Costs and Business Ledger;
- Archive / Trash / Restore and guarded permanent deletion;
- unified search across core domains.

## Local development

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## Acceptance discipline

A data-changing feature is not considered complete until its important path has been tested against real Supabase persistence, including `save → refresh → confirm`, plus phone and DeX/desktop behaviour where relevant.
