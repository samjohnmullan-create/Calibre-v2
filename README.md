# Calibre & Co.

**Canonical Calibre application.**

> **Product direction:** Calibre is the operating system for the workshop, inventory, knowledge, business and public/customer experience.

The original `CalibreOI` repository is retired and archived. All active product development and production releases now originate from this repository.

## Production

Customer site: `https://calibreco.com.au`

Workshop application: `https://app.calibreco.com.au`

GitHub Pages deployment is built from `main` through `.github/workflows/deploy-pages.yml`.

The frontend distinguishes the public customer hostname from the workshop surface. `calibreco.com.au` renders the customer experience, while customer-visible data comes from the intentionally published `customer_publications` projection rather than direct access to internal workshop records.

Production cutover for the workshop application completed on 15 October 2026. The legacy `CalibreOI` repository is archived and no longer owns the production application.

## Single source of truth

The one and only product roadmap is:

[`docs/CALIBRE_V2_MASTER_ROADMAP.md`](docs/CALIBRE_V2_MASTER_ROADMAP.md)

That document is the **locked canonical roadmap** and supersedes every earlier roadmap, rollout sequence, product-plan discussion and informal build order.

Supporting documents in `docs/` are implementation references only. They do not create separate priorities, architecture or product direction. If any supporting document conflicts with the canonical roadmap, the roadmap wins.

New ideas must be fitted into an existing roadmap phase, explicitly deferred, or accepted through a deliberate amendment to the canonical roadmap. Do not create parallel roadmaps.

## Architecture

- Item is the permanent physical-object root.
- Work is separate and optional; an Item can have many Work records.
- Supabase is authoritative.
- One fact has one canonical owner, with many views.
- No legacy `jobs`, `currentId`, or browser-owned master state.
- Internal data remains private; public/customer pages use an intentionally published sanitised projection.
- Evidence, confidence and history are preserved rather than replaced by guessed certainty.
- Material decisions remain explicit and auditable.
- Test/Demo records must not contaminate Workshop Memory, finance or customer outputs.

## Customer publishing

Authenticated Calibre users can open `#/customer` to prepare the public record for an Item.

The Publishing Studio can:

- prefill verified Item and Passport facts;
- prepare customer-safe descriptions, condition, provenance and service summaries;
- copy selected private workshop images into the separate public media library;
- set catalogue, availability and archive state;
- issue and preview Watch Passport and Certificate records;
- explicitly publish, update or unpublish a customer record.

Nothing becomes public merely because it exists internally. A customer record must be deliberately published.

## Backend

Supabase project: `zmhbrqkzvgajmvhhorba` (Sydney / `ap-southeast-2`).

The frontend uses the Supabase **publishable** key. No secret/service-role key belongs in this repository.

## Authentication

Calibre currently uses email OTP sign-in:

1. Enter the authorised email address.
2. Request a verification code.
3. Enter the **8-digit** code from the email.
4. The Supabase session is restored on subsequent visits until signed out/expired.

## Current product state — 16 October 2026

Current `main` includes substantial foundations for:

- responsive phone + DeX/desktop shell;
- live Items workspace and Item editing;
- Workbench command-centre foundations;
- Workshop Induction and generated job plans;
- Bench Mode with session timing and quick capture;
- structured guided procedure checks and branching;
- deterministic diagnostic graph + AI reasoning layer;
- Movement Intelligence identity gates and sourced guidance framework;
- structured measurements, Part Needs and workshop evidence;
- smart Bench exceptions and readiness checks;
- sourced Bench Knowledge tied to Passport movement data;
- native AudioWorklet Timegrapher with Work-linked timing checkpoints;
- Parts reservation, fit evidence, consumption and fulfilment;
- storage/location history and Needs Put-away;
- Item economics, Stock, Listings, Sales, Costs and Business Ledger foundations;
- Archive / Trash / Restore and guarded permanent deletion;
- unified search across core domains;
- public customer homepage, catalogue and sold archive;
- deliberately published Watch Passports and Certificates;
- Customer Publishing Studio with separate public media storage.

The active focus remains driven by the canonical roadmap.

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

Important changes should also verify database integrity, audit/history behaviour, security/RLS where applicable, and real-workflow acceptance.
