# Calibre v2

Clean rebuild of Calibre & Co.

> **Product direction:** Calibre is the operating system for the workshop, inventory, research and resale business.

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

## Backend

Supabase project: `zmhbrqkzvgajmvhhorba` (Sydney / `ap-southeast-2`).

The frontend uses the Supabase **publishable** key. No secret/service-role key belongs in this repository.

## Authentication

Calibre currently uses email OTP sign-in:

1. Enter the authorised email address.
2. Request a verification code.
3. Enter the **8-digit** code from the email.
4. The Supabase session is restored on subsequent visits until signed out/expired.

## Current product state — 12 October 2026

- responsive phone + DeX/desktop shell;
- live Items workspace and Item editing;
- Workbench trays with persistent status/priority/next-action/blockers;
- real Oris acceptance Item/Work record;
- Photos/Media implementation in acceptance testing;
- Passport, Research, Knowledge Engine, donor/parts intelligence, deeper commerce and Timegrapher v2 remain on the roadmap.

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
