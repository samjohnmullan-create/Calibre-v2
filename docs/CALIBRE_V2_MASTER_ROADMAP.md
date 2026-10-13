# Calibre & Co. v2 — Master Roadmap

**Status:** Canonical product and engineering roadmap  
**Last updated:** 13 October 2026  
**Repository:** `samjohnmullan-create/Calibre-v2`  
**Rule:** This document is the source of truth for what Calibre is, what has been accepted, what is deferred, and what must be tested before a phase is considered complete.

---

## 1. Product statement

> **Calibre is the operating system for the workshop, inventory, research, commerce and resale business.**

The physical Item is the centre of the system, but Calibre must be capable of running the entire business without requiring a second spreadsheet or shadow database.

**Core lifecycle**

`Acquisition → Identification → Research → Work → Parts → Timing → QC → Valuation → Listing → Sale → Permanent history`

**Business lifecycle**

`Cash out → Stock acquired → Value added → Stock prepared → Sale realised → Costs settled → Profit understood`

Calibre should reduce workshop friction, preserve evidence, make operational state obvious and provide trustworthy financial answers.

---

## 2. Architectural laws

These are locked unless this roadmap is deliberately amended first.

1. **Item is the physical-object root.**
2. **Work is separate and optional.** One Item may have many Work records.
3. **Supabase is authoritative.** Browser state is never the master record.
4. **No resurrection of legacy `jobs`, `currentId`, or one giant mutable business state.**
5. **URLs/deep links identify the thing being viewed.**
6. **Media is uploaded once and reused by context.**
7. **Research produces structured findings with sources, confidence and explicit decisions.**
8. **Accepting evidence and applying it to canonical data are different actions.**
9. **Reference knowledge and bench evidence are distinct.** Published compatibility and a physically confirmed fit are not the same claim.
10. **Costs are transactions; valuations are snapshots; sales are lifecycle records.**
11. **Private internal data is never exposed directly to customers.**
12. **Generic Item core; specialist watchmaking modules where appropriate.**
13. **Donor is an Item purpose/relationship, not a separate top-level object type.**
14. **AI may propose; it does not silently rewrite accepted facts.**
15. **Unknown stays unknown. No fake precision.** This applies especially to calibre identity, compatibility, water resistance and timegrapher amplitude.
16. **Schema changes are committed migrations.**
17. **A data-changing feature is not accepted until `change → save → refresh → confirm` succeeds.**
18. **Phone and DeX/desktop are separate acceptance targets.**
19. **Dead implementations are removed after replacement. Git is the archive.**
20. **Business metrics come from underlying records, never hand-entered totals.**
21. **Historical records are immutable where practical.** Completed Work, realised Sales and imported source documents must remain auditable.
22. **Scale is designed in, not retrofitted.** Hundreds or thousands of Items and transactions must remain searchable and performant.
23. **Money must be traceable.** Every financial result must be explainable back to source transactions and allocations.
24. **Operational workflow and accounting truth are separate but linked.** A job status is not a financial transaction; a valuation is not cash.

---

## 3. Current accepted state — 13 October 2026

### Foundation

- ✅ Separate clean Supabase v2 project in Sydney.
- ✅ Workspace/membership model and RLS.
- ✅ Private `calibre-media` bucket.
- ✅ Email OTP authentication.
- ✅ Canonical React/TypeScript/Vite app on GitHub Pages.
- ✅ One current `App.tsx`; earlier AppV2/V3/V4 copies removed.
- ✅ Item and Work deep-link handling.
- ✅ Galaxy phone and DeX-responsive shell.
- ✅ Mobile card-size audit accepted.
- ✅ Canonical responsive card containment layer added.
- ✅ Calibre Knowledge page renders directly from the canonical app.

### Item / Work

- ✅ Items list and Item workspace.
- ✅ Item editing and persistence.
- ✅ Workbench lanes: Queue, Ready, On bench, Waiting, QC, Complete.
- ✅ Work priority, next action, waiting reason and blocker persistence.
- ✅ Work links resolve the parent Item/Work context.
- ✅ Basic Commerce area exists but is not yet a full business-grade module.

### Acquisition / Invoice intake

- ✅ Upload invoice/photo.
- ✅ Server-side extraction.
- ✅ Structured invoice and line extraction.
- ✅ Historical AUD conversion.
- ✅ Review before import.
- ✅ Imported source document linked to created Items without duplication.
- ✅ Extracted Item attributes feed identity/passport/facts.
- ✅ Imported Items can be opened directly after successful import.

Remaining:

- allocation of invoice-level fees/postage/premium;
- proper purchase/lot records;
- incoming/received states;
- bundle splitting;
- acquisition cost projection into Commerce/finance.

### Media

- ✅ Private uploads.
- ✅ `media_assets` metadata.
- ✅ categories.
- ✅ cover/primary selection.
- ✅ signed previews.
- ✅ upload/remove/refresh flow accepted.

Remaining hardening: thumbnails/compression, dimensions/taken-at metadata, stronger single-primary enforcement and orphan cleanup.

### Passport

- ✅ Internal permanent technical dossier accepted.
- ✅ movement, case, dimensions, provenance and technical notes.
- ✅ explicit water-resistance marking caution.
- ✅ unknown values remain unknown.
- ✅ Knowledge movement linkage supports provenance for proposed movement identity.

### Research

- ✅ Item research workspace.
- ✅ ChatGPT handoff workflow.
- ✅ Item/passport snapshot included in requests.
- ✅ signed private photo links included in requests.
- ✅ structured findings, sources, confidence and decisions.
- ✅ source links visible.
- ✅ Accept does not silently rewrite canonical data.
- ✅ explicit Current / Proposed / Apply / Keep / Ignore bridge accepted.

Remaining hardening: stronger photo handoff and long-term accepted fact/evidence projection.

### Knowledge Engine

- ✅ v35 knowledge engine imported successfully.
- ✅ provenance/evidence model.
- ✅ movement families.
- ✅ parts references and applications.
- ✅ compatibility edges.
- ✅ identification signals.
- ✅ technical documents.
- ✅ knowledge rules.
- ✅ **Calibre Verified** bench-evidence layer.

Current imported scale at acceptance:

- 17,023 movements
- 4,350 part references
- 1,073 part applications
- 8,961 compatibility edges
- 88 sources
- 61 movement families
- 65 identification signals
- 10 technical documents
- 8 knowledge rules
- 32,514 raw source records preserved

### Movement Search / Finder

- ✅ searchable movement library.
- ✅ maker / calibre / family / alias / brand search.
- ✅ evidence-backed results.
- ✅ explainable candidate ranking.
- ✅ Passport prefill and candidate application.
- ✅ persistent Knowledge movement linkage.

---

# NEW DELIVERY ORDER

Legend: ✅ accepted · 🟡 active/partial · ⬜ planned · 💤 deliberately deferred · 🧪 exploratory

The delivery order is now intentionally business-first:

`Foundation & Scale → Acquisition → Workshop → Parts & Storage → Commerce & Ledger → Business Brain → Listings → Customer/Public → Automation & Hardware`

---

## Phase A — Business-grade foundation and scale

**Status: 🟡 active and mandatory before major expansion**

Goal: make Calibre safe to operate with hundreds or thousands of Items, Work records and transactions.

### Data and engineering

- [ ] generate and commit Supabase TypeScript database types;
- [ ] ensure all core schema changes exist as repository migrations;
- [ ] define canonical service/data access boundaries;
- [ ] continue decomposing oversized UI components;
- [ ] CI typecheck/build plus focused regression tests;
- [ ] RLS/security acceptance tests;
- [ ] internal system-health diagnostics where useful;
- [ ] idempotent write patterns for imports, automation and retries.

### Scale

- [ ] server-side pagination for Items, Work, transactions and Files;
- [ ] indexed server-side search/filter/sort;
- [ ] saved views for common operating states;
- [ ] avoid N+1 queries and unbounded client loading;
- [ ] primary thumbnails in high-volume lists;
- [ ] deterministic numbering rules;
- [ ] archive rather than hard delete for business records.

### Audit / resilience

- [ ] user-facing lifecycle history;
- [ ] backend audit trail for critical mutations;
- [ ] database/media backup policy;
- [ ] export path for critical business data;
- [ ] real restore drill before Calibre becomes business-critical;
- [ ] duplicate detection for invoice/import workflows;
- [ ] error observability for failed writes and background tasks.

**Exit gate:** a few hundred Items must remain fast and trustworthy on phone and DeX.

---

## Phase B — Acquisition and inventory operations

**Status: 🟡 invoice intake exists; full acquisition model is next**

Goal: every purchase enters Calibre once and remains traceable from source document to physical Item and final sale.

### Acquisition model

- [x] invoice document intake;
- [x] structured extraction/review/import;
- [x] AUD conversion;
- [x] original document preserved and linked to Item;
- [ ] first-class purchase record;
- [ ] vendor / auction house / source linkage;
- [ ] order/invoice/lot references;
- [ ] incoming / in transit / received / discrepancy states;
- [ ] multi-Item lots and bundles;
- [ ] manual purchase entry for non-invoice acquisitions;
- [ ] received date and physical intake confirmation.

### Cost allocation

- [ ] line purchase cost to Item;
- [ ] allocate buyer premium, postage, tax and shared fees;
- [ ] default proportional allocation by line value;
- [ ] allow manual override;
- [ ] preserve original currency and AUD basis;
- [ ] allocation audit trail.

### Inventory operations

- [ ] proper create-item flow everywhere;
- [ ] Item archive flow;
- [ ] physical location summary;
- [ ] primary image in Item list/header;
- [ ] server-side search and filters;
- [ ] views for Incoming, Received, Queue, On bench, Ready for sale, Listed, Sold, Donor.

**Exit gate:** every physical Item can answer “where did I buy it, what did it really cost, where is it now?”

---

## Phase C — Workshop / repair operations

**Status: 🟡 Workbench shell exists; deeper service system is now a priority**

Goal: run a repair/service job start-to-finish from Calibre.

### Work record

- [ ] dedicated Work detail view;
- [ ] diagnosis/fault list;
- [ ] Work events/timeline;
- [ ] next action/blocker/priority;
- [ ] linked measurements;
- [ ] linked timing runs;
- [ ] Work media roles;
- [ ] parts required / allocated / used;
- [ ] completion summary;
- [ ] printable/generated Job Card.

### Versioned Work Templates

Templates are copied into Work when a job starts so historical jobs do not change when templates are edited later.

Initial templates:

- [ ] full mechanical service;
- [ ] quartz service;
- [ ] clean & inspect;
- [ ] crystal replacement;
- [ ] balance repair;
- [ ] mainspring replacement;
- [ ] regulation only;
- [ ] case restoration;
- [ ] diagnostic inspection;
- [ ] customer repair.

Suggested mechanical-service template:

`Intake & diagnosis → Pre-service timing → Demagnetise/check → Case/movement removal → Strip-down → Component inspection → Cleaning → Barrel & mainspring → Train → Keyless/winding → Escapement → Balance → Lubrication → Assembly → Regulation → Casing → Positional timing → Final QC`

Each checklist step should support:

- Not started / In progress / Done / N/A / Blocked;
- notes;
- photos;
- measurements;
- parts used;
- timestamps;
- optional required completion.

### QC gate

- [ ] explicit QC checklist;
- [ ] required QC items before completion where applicable;
- [ ] final timing/functional record;
- [ ] customer-safe service summary generated separately from internal notes.

**Exit gate:** one real watch can be taken from intake through service and QC without external notes.

---

## Phase D — Parts, donors and physical storage

**Status: 🟡 schema/infrastructure exists; operational UX incomplete**

Goal: know what parts exist, where they are, what may fit and what actually fitted.

### Parts

- [ ] stock quantity / condition / provenance;
- [ ] donor Item linkage;
- [ ] measurements where useful;
- [ ] storage location;
- [ ] acquisition cost;
- [ ] compatibility evidence;
- [ ] actual bench-fit verification;
- [ ] allocation to Work;
- [ ] consumed / returned / failed-fit states.

### Donors

- [ ] donor relationships between Items;
- [ ] automatic compatible-donor suggestions;
- [ ] preserve donor lineage/history;
- [ ] donor depletion visibility.

### Physical storage

Hierarchy target:

`Workshop → Cabinet → Drawer → Tray → Position`

- [ ] assign/move Items and parts;
- [ ] location history;
- [ ] QR lookup/moves later.

**Rule:** family similarity is a lead, not proof of fit.

---

## Phase E — Commerce and proper financials

**Status: ⬜ next major business module after Work foundation**

Goal: make every Item’s financial result explainable and build the ledger needed to run the business.

### Item commerce

One Item should support:

`Acquisition → Added costs → Valuation → Listing → Offers → Sale → Realised result`

- [ ] acquisition cost projection from Purchase/Invoice;
- [ ] allocated premium/postage/shared fees;
- [ ] parts/materials cost;
- [ ] external service cost;
- [ ] packaging cost;
- [ ] valuation snapshots;
- [ ] target/minimum/list price;
- [ ] realised sale;
- [ ] selling fees;
- [ ] outbound postage;
- [ ] refunds/discounts;
- [ ] total invested;
- [ ] gross profit;
- [ ] net profit;
- [ ] margin %;
- [ ] ROI %;
- [ ] days held.

### Business ledger

Calibre must separate Item economics from whole-business cash flow.

Transaction categories should include:

- stock purchases;
- Item-specific parts/materials;
- tools/equipment;
- consumables;
- postage/freight;
- marketplace/payment fees;
- advertising;
- subscriptions/software;
- external services;
- other operating expenses;
- sales income;
- refunds;
- owner contributions/drawings where required.

### Accounting principles

- [ ] business ledger is append-oriented and auditable;
- [ ] tools/equipment are not silently allocated as watch costs;
- [ ] stock costs and operating expenses remain distinguishable;
- [ ] realised cash and hypothetical valuation remain separate;
- [ ] financial totals are computed from transactions, not hand-entered summaries;
- [ ] foreign currency preserves source amount, exchange basis and AUD equivalent;
- [ ] corrections use reversal/adjustment records where practical rather than destructive edits.

**Exit gate:** an Item and the overall business can both explain where every dollar came from or went.

---

## Phase F — Business Brain

**Status: ⬜ planned after ledger truth exists**

Goal: turn operational and financial records into useful decisions.

### Core questions

- actual cash position;
- stock at cost;
- capital tied up in stock;
- estimated sale value;
- expected vs realised profit;
- realised revenue;
- gross and net profit;
- monthly P&L;
- average margin;
- average ROI;
- average days to sale;
- most/least profitable Items;
- slow/dead stock;
- incoming purchases/parts;
- sale-ready stock;
- waiting Work/blockers;
- tool vs stock expenditure.

### Decision support

Target question:

> **What should I work on next?**

The answer may consider:

- remaining estimated effort;
- blockers/parts dependency;
- expected profit;
- value tied up;
- listing readiness;
- customer deadlines;
- age in queue;
- confidence of estimate.

All recommendations must show reasoning and remain advisory.

---

## Phase G — Listing and sales engine

**Status: ⬜ planned**

Goal: generate sale material from accepted facts only and preserve marketplace lifecycle.

Model:

`Item → Listings → Offers → Sale`

- [ ] first-class listing records;
- [ ] multiple channels per Item;
- [ ] listed date / price / channel / external URL;
- [ ] offer tracking;
- [ ] accepted/rejected/countered offers;
- [ ] sale conversion;
- [ ] channel-specific listing generation;
- [ ] image selection/order;
- [ ] publication checklist.

Never invent water resistance, service state, originality or technical certainty.

---

## Phase H — Customer and public layer

**Status: 💤 later**

Calibre remains private source of truth.

Customer/public outputs come from an explicitly sanitised publication projection.

Potential outputs:

- customer-safe Passport;
- service/repair report;
- invoice/receipt;
- public catalogue;
- Wix website integration;
- QR provenance page;
- post-sale service history where appropriate.

---

## Phase I — Tools, consumables and workshop registry

**Status: 🟡 schema exists; UX later**

- [ ] tool registry;
- [ ] purchase value/date/source;
- [ ] asset vs consumable distinction;
- [ ] consumable stock and reorder levels;
- [ ] storage location;
- [ ] service/calibration dates where relevant;
- [ ] business-expense integration.

Tools remain business assets/expenses, not automatic watch costs.

---

## Phase J — Timegrapher v2

**Status: 💤 deferred until dedicated mic/hardware is validated**

Target:

- sample-clock / AudioWorklet timing;
- BPH;
- rate;
- beat error;
- stability;
- positions;
- persistent before/after runs;
- direct linkage to Work and QC.

**Amplitude remains disabled until lift-angle provenance and algorithm/microphone calibration are defensible.**

---

## Phase K — Printing and physical workflow

**Status: 🧪 explore after storage/QR**

Preferred direction:

- browser/PDF outputs;
- central Print Queue / Print Bridge;
- desktop-only support for incompatible label hardware;
- no custom printer-specific Android driver inside Calibre unless absolutely necessary.

Potential outputs:

- Item labels;
- storage labels;
- Job Cards;
- customer repair reports;
- invoices/receipts;
- QR Passport labels.

---

## Phase L — Device modes / Smart Capture

**Status: 🧪 later**

One system adapted to context:

- phone: quick status, photos, measurements, parts, QR;
- DeX: research, finance, comparisons, dense admin;
- capture station: microscope/camera capture against a selected Item.

---

## Phase M — Global search / command layer

**Status: ⬜ planned once record counts justify it**

Search across:

- Items;
- Work;
- movement/calibre knowledge;
- parts;
- donors;
- locations;
- vendors/sources;
- invoices/purchases;
- transactions;
- listings/offers/sales;
- tools/consumables.

Potential command actions:

- open Item;
- move Work;
- add cost;
- mark part received;
- locate donor;
- start Work template;
- open linked source document.

---

## Phase N — Automation and learning loop

**Status: 💤 after manual workflows are proven**

Potential automation:

- purchase emails/invoices;
- shipment/part arrival;
- waiting/stale Work alerts;
- auction intake;
- listing/publication workflow;
- finance summaries;
- reorder warnings;
- scheduled business briefs.

Learning should use confirmed bench evidence while preserving the difference between factory documentation, workshop confirmation and dimensional inference.

---

# CROSS-CUTTING GATES

These apply throughout the roadmap and are not “later features”.

## Scale and performance

- server-side pagination/search/filter as lists grow;
- thumbnails instead of full images in lists;
- indexed reference searches;
- avoid N+1 requests;
- cache only as convenience, never as source of truth;
- test representative large data sets before claiming scale readiness.

## Timeline/history

Build user-facing lifecycle history from meaningful business events. Do not confuse it with low-level audit logging.

## Backups/recovery

Database/media backup, export and a tested restore process are mandatory before Calibre becomes business-critical.

## Security

RLS on workspace-owned data; least privilege; no frontend secrets; signed private media; explicit publication boundary.

## Financial integrity

- no profit without transactions;
- no cash position from valuations;
- no silent allocation changes;
- original currency preserved;
- material financial changes auditable.

## Offline/PWA

Not immediate. If added later, offline writes require a visible outbox and explicit conflict policy; Supabase remains authoritative.

## Phone / DeX acceptance

Every operational phase must be usable on phone and DeX/desktop before being accepted.

## Design language

Keep the accepted “Swiss technical instrument / old steel / workshop” direction. Do not let aesthetic churn interrupt workflow progress.

---

# IMMEDIATE EXECUTION PLAN

This is the active order from this point forward.

### 1. Foundation hardening

- [ ] DB types;
- [ ] missing migration cleanup;
- [ ] pagination/search foundation;
- [ ] error/audit hardening;
- [ ] backup/export plan.

### 2. Proper Work / Job Card

- [ ] dedicated Work view;
- [ ] Work Templates;
- [ ] real service checklist;
- [ ] Work events;
- [ ] parts/measurements/media linkage;
- [ ] QC gate;
- [ ] Job Card output.

### 3. Acquisition completion

- [ ] purchase/lot model;
- [ ] cost allocations;
- [ ] incoming/received workflow;
- [ ] Item acquisition projection.

### 4. Parts / donors / storage

- [ ] stock operations;
- [ ] donor suggestions;
- [ ] allocation/use/fit verification;
- [ ] physical storage hierarchy.

### 5. Commerce / ledger

- [ ] transaction model;
- [ ] Item economics;
- [ ] business expenses/income;
- [ ] realised sale math;
- [ ] first finance views.

### 6. Business Brain

- [ ] dashboard;
- [ ] stock/cash/profit reporting;
- [ ] operational recommendations.

### 7. Listings and customer/public outputs

Only after the operational and financial spine is trustworthy.

---

# DEFINITION OF DONE

Unless not applicable, a phase is complete only when:

1. the canonical data owner is clear;
2. migrations are committed;
3. real Supabase records are used;
4. save → refresh persistence succeeds;
5. phone acceptance passes;
6. DeX/desktop acceptance passes;
7. empty/loading/error states exist;
8. permissions/RLS are correct;
9. destructive actions are deliberate and recoverable where appropriate;
10. history/audit behaviour is defined;
11. performance is acceptable at the intended record scale;
12. financial calculations, where applicable, can be traced to source records;
13. no legacy duplicate implementation remains active;
14. the roadmap is updated to reflect the accepted reality.
