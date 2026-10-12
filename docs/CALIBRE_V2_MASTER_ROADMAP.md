# Calibre & Co. v2 — Master Roadmap

**Status:** Canonical product and engineering roadmap  
**Last updated:** 13 October 2026  
**Repository:** `samjohnmullan-create/Calibre-v2`  
**Rule:** This document is the source of truth for what Calibre is, what has been accepted, what is deferred, and what must be tested before a phase is considered complete.

---

## 1. Product statement

> **Calibre is the operating system for the workshop, inventory, research and resale business.**

The physical Item is the centre of the system.

**Lifecycle**

`Acquisition → Identification → Research → Work → Parts → Timing → QC → Valuation → Listing → Sale → Permanent history`

Calibre should reduce workshop friction, not turn watchmaking into data entry.

---

## 2. Architectural laws

These are locked unless this roadmap is deliberately amended first.

1. **Item is the physical-object root.**
2. **Work is separate and optional.** One Item may have many Work records.
3. **Supabase is authoritative.** Browser state is never the master record.
4. **No resurrection of legacy `jobs`, `currentId`, or one giant mutable business state.**
5. **URLs/deep links identify the thing being viewed.** Current hash routes include `#/items/:id`, `#/work/:id`, `#/workbench`, and `#/calibre`.
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

---

## 3. Current accepted state — 13 October 2026

### Foundation

- ✅ Separate clean Supabase v2 project in Sydney.
- ✅ Workspace/membership model and RLS.
- ✅ Private `calibre-media` bucket.
- ✅ 8-digit email OTP authentication.
- ✅ Canonical React/TypeScript/Vite app on GitHub Pages.
- ✅ One current `App.tsx`; earlier AppV2/V3/V4 copies removed.
- ✅ Item and Work deep-link handling.
- ✅ Galaxy phone and DeX-responsive shell.
- ✅ Mobile card-size audit accepted.
- ✅ Canonical responsive card containment layer added.
- ✅ Calibre Knowledge page now renders directly from the canonical app; the temporary portal/MutationObserver route mount has been removed.

### Item / Work

- ✅ Items list and Item workspace.
- ✅ Item editing and persistence.
- ✅ Workbench trays: Queue, Ready, On bench, Waiting, QC, Complete.
- ✅ Work priority, next action, waiting reason and blocker persistence.
- ✅ Work links can resolve the parent Item/Work context.
- ✅ Commerce summary currently shows recorded cost and valuation position.

### Media

- ✅ Private uploads.
- ✅ `media_assets` metadata.
- ✅ categories.
- ✅ cover/primary selection.
- ✅ signed previews.
- ✅ upload/remove/refresh flow user-accepted.

Remaining hardening: thumbnails/compression, dimensions/taken-at metadata, stronger single-primary enforcement and orphan cleanup.

### Passport

- ✅ Internal permanent technical dossier user-accepted.
- ✅ movement, case, dimensions, provenance and technical notes.
- ✅ explicit water-resistance marking caution.
- ✅ unknown values remain unknown.
- ✅ Knowledge movement linkage supports provenance for proposed movement identity.

### Research

- ✅ Item research workspace.
- ✅ ChatGPT copy/paste handoff token workflow.
- ✅ Item/passport snapshot included in requests.
- ✅ signed private photo links included in requests.
- ✅ structured findings, sources, confidence and decisions.
- ✅ source links visible.
- ✅ Accept does not silently rewrite canonical data.
- ✅ explicit Current / Proposed / Apply / Keep / Ignore bridge user-accepted.

Remaining hardening: make research photo handoff more reliably assistant-accessible and mirror accepted canonical facts into the long-term Item fact/evidence history where appropriate.

### Knowledge Engine

- ✅ v35 knowledge engine imported successfully.
- ✅ import-batch tracking and chunked ingestion.
- ✅ generated/candidate data remains distinguishable from documented data.
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
- ✅ evidence grade and verification status shown with results.
- ✅ linked source evidence.
- ✅ Movement Finder ranks candidates from actual bench clues.
- ✅ ranking explains why a candidate scored.
- ✅ missing data does not count against a movement.
- ✅ documented evidence is preferred over weak/generated coincidence.
- ✅ Movement Finder can launch from Passport with prefilled clues.
- ✅ candidate can be reviewed before application.
- ✅ Passport application remains explicitly **candidate**, not automatically confirmed.
- ✅ direct Knowledge Engine movement link persists with the Passport.

---

# ROADMAP

Legend: ✅ accepted · 🟡 active/partial · ⬜ planned · 💤 deliberately deferred · 🧪 exploratory

---

## Phase 0 — Clean foundation

**Status: ✅ substantially complete**

Still to close fully:

- [ ] generate and commit Supabase TypeScript database types;
- [ ] ensure earlier/core schema changes are represented by repository migrations, not only newer Research/Knowledge migrations;
- [ ] document environment/deployment conventions completely;
- [ ] normalise package-lock/dev setup if still inconsistent.

---

## Phase 0.5 — Stop-the-rot stabilisation

**Status: 🟡 major visible work accepted; engineering cleanup remains**

Completed:

- [x] one canonical App implementation;
- [x] obsolete AppV2/V3/V4 implementations removed;
- [x] Item/Work deep links;
- [x] responsive phone/DeX shell accepted;
- [x] mobile card-size audit and shared card geometry;
- [x] Passport, Research and Knowledge isolated into focused components;
- [x] Knowledge page removed from temporary portal/MutationObserver routing;
- [x] roadmap refreshed to match reality.

Remaining:

- [ ] continue breaking oversized `App.tsx` into low-risk feature/page components;
- [ ] pull raw Supabase access from large UI components into focused services/hooks where useful;
- [ ] generate DB types;
- [ ] commit missing early/core migrations;
- [ ] cautiously consolidate duplicated shell/mobile CSS only when visual parity can be verified;
- [ ] CI typecheck/build plus focused unit/e2e regression coverage;
- [ ] RLS/security acceptance tests as the backend grows;
- [ ] optional internal system-health view.

**Rule:** do not destabilise accepted phone/DeX geometry merely to make the CSS tree prettier.

---

## Phase 1 — Core Item workspace

**Status: 🟡 mostly complete**

Completed:

- [x] Items list and selection;
- [x] Item workspace;
- [x] identity display/edit persistence;
- [x] Work / Item / Passport / Commerce areas;
- [x] deep-link foundations.

Next:

- [ ] real create-item flow;
- [ ] Item search/filter;
- [ ] soft archive flow;
- [ ] Item timeline/history;
- [ ] physical location summary;
- [ ] primary photo in Item list/header.

---

## Phase 2 — Media and Capture

**Status: ✅ core accepted**

Next hardening:

- [ ] Take photo vs Choose photos mobile workflow if useful;
- [ ] image resize/compression and thumbnails;
- [ ] width/height/taken-at metadata;
- [ ] enforce one primary image per Item;
- [ ] orphan-safe storage/database cleanup;
- [ ] later Capture Station for Galaxy Tab/microscope workflow.

---

## Phase 3 — Passport

**Status: ✅ core accepted**

Later additions:

- [ ] service-history summary;
- [ ] measurement/timing summaries;
- [ ] export/printable internal Passport;
- [ ] separate customer-safe publication projection.

---

## Phase 4 — Research and evidence

**Status: ✅ core accepted**

Next:

- [ ] stronger photo handoff;
- [ ] accepted fact/evidence history projection;
- [ ] contradiction/diff tooling as research grows;
- [ ] research missing-information prompts.

---

## Phase 5 — Knowledge Engine ingestion

**Status: ✅ v35 ingestion accepted**

Rules remain:

1. exact documented part/factory reference outranks similarity;
2. documented application/interchange outranks family inference;
3. serial/grade-specific exceptions matter;
4. family relationship is a lead, not proof;
5. dimensional/visual similarity is candidate evidence only;
6. generated expansion data never masquerades as documented fact;
7. bench verification remains distinct from published reference truth.

---

## Phase 6 — Movement Finder

**Status: ✅ first practical version accepted**

Completed:

- [x] movement library search;
- [x] evidence-backed result detail;
- [x] ranked candidate finder;
- [x] explainable scoring;
- [x] Passport prefill and candidate application;
- [x] persistent Knowledge movement linkage.

Later:

- [ ] visual architecture signals;
- [ ] seconds/layout/date/setting-system inputs;
- [ ] “what measurement next?” discriminator;
- [ ] photo-assisted identification with explicit human confirmation.

---

## Phase 7 — Parts, donors and physical storage

**Status: ⬜ NEXT after current cleanup**

Build order:

1. parts inventory;
2. donor inventory/relationships;
3. evidence-ranked compatibility suggestions;
4. bench fit verification;
5. physical storage hierarchy;
6. QR lookup/location moves.

For each stock part, preserve:

- normalised part identity/reference;
- quantity/condition;
- provenance/source;
- donor Item where applicable;
- measurements where useful;
- storage location;
- cost;
- compatibility evidence;
- actual bench fit result where known.

Never treat “same family” as guaranteed fit.

---

## Phase 8 — Deeper Work / service templates / measurements / QC

**Status: 🟡 Workbench core exists**

Next depth:

- [ ] dedicated Work view;
- [ ] diagnosis/fault list;
- [ ] Work events/timeline;
- [ ] linked measurements;
- [ ] parts required/used;
- [ ] timing runs;
- [ ] Work media roles;
- [ ] QC record;
- [ ] completion summary;
- [ ] generated Job Card output.

Legacy service sequence may return only as optional templates inside Work:

`Intake → Demagnetising → Strip-down → Inspection → Cleaning → Barrel & Mainspring → Train Test → Escapement → Balance → Lubrication → Regulation → Final QC`

---

## Phase 9 — Acquisition and commerce

**Status: ⬜ planned**

Includes:

- purchase/auction intake;
- source/vendor/lot/order references;
- premium/postage/fees;
- incoming/received state;
- multi-Item lot split;
- valuation snapshots and market comps;
- realised sale, fees, profit and ROI.

Actual cash must not be inferred from hypothetical bids or stock valuations.

---

## Phase 10 — Business Brain

**Status: ⬜ planned**

Target questions:

- actual available cash;
- capital tied up in stock;
- expected vs realised profit;
- most profitable Items;
- slow stock;
- tools vs stock costs;
- incoming purchases/parts;
- sale-ready stock;
- waiting Work/blockers;
- “what should I work on next?” with transparent reasoning.

A proper business/cash ledger is required before claiming “available cash”.

---

## Phase 11 — Listing engine

**Status: ⬜ planned**

Generate channel-specific sale material from accepted facts only. Never invent water resistance, service state or technical certainty.

Review whether first-class `listings` records are required before implementation.

---

## Phase 12 — Timegrapher v2

**Status: 💤 deferred until dedicated mic/hardware is validated**

Target: sample-clock/AudioWorklet timing, BPH, rate, beat error, stability, positions and persistent before/after runs.

**Amplitude remains disabled until lift-angle provenance and algorithm/microphone calibration are defensible.**

---

## Phase 13 — Printing and physical workflow

**Status: 🧪 explore after storage/QR**

Preferred direction: browser/PDF outputs plus a central **Print Queue / Print Bridge** for desktop-only label hardware. Do not build printer-specific Android drivers into Calibre.

---

## Phase 14 — Wix/public catalogue and customer Passport

**Status: 💤 later**

Calibre remains private source of truth. Public/customer data comes from a separate explicitly published/sanitised projection.

---

## Phase 15 — Tools, consumables and workshop registry

**Status: ⬜ planned**

Tools remain business assets, not watch costs. Consumables can support stock/reorder/location intelligence where useful.

---

## Phase 16 — Device modes / Smart Capture

**Status: 🧪 later**

Use one system adapted to context:

- phone: quick status, photos, measurements, parts, QR;
- DeX: dense research/business/comparison work;
- capture station: microscope/camera capture against a selected Item.

---

## Phase 17 — Global search / command layer

**Status: 🧪 later**

Search across Items, Work, calibre, parts, donors, locations, sources and sales once record counts justify it.

---

## Phase 18 — Automation and learning loop

**Status: 💤 after manual workflows are proven**

Potential automation:

- purchase emails;
- shipment/part arrival;
- waiting/stale Work alerts;
- auction intake;
- listing/publication workflow;
- scheduled business summaries.

Learning should use confirmed bench evidence while preserving the difference between factory documentation, workshop confirmation and dimensional inference.

---

# CROSS-CUTTING GATES

## Timeline/history

Build a user-facing Item history from meaningful lifecycle events. Do not confuse it with low-level audit logging.

## Backups/recovery

Define database/media backup, exports and an actual restore drill before Calibre becomes business-critical.

## Security

RLS on workspace-owned data; least privilege; no frontend secrets; signed private media; explicit publication boundary.

## Performance

Prefer thumbnails, pagination/search as data grows, indexed reference searches and avoidance of N+1 requests. Caching must never become a second source of truth.

## Offline/PWA

Not immediate. If added later, offline writes require an explicit visible outbox and conflict policy; Supabase remains authoritative.

## Design language

Keep the accepted “Swiss technical instrument / old steel / workshop” direction. Do not let aesthetic churn interrupt workflow progress.

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
8. security/RLS is appropriate;
9. obsolete implementation is removed;
10. build/verification passes;
11. this roadmap reflects reality;
12. the user accepts the test checklist.

---

# IMMEDIATE EXECUTION ORDER

1. **Finish current internal cleanup / stabilisation pass.**
2. **Parts + donor inventory and compatibility intelligence.**
3. **Storage hierarchy + QR.**
4. **Deeper Work, measurements and QC.**
5. **Acquisition + commerce.**
6. **Business Brain.**
7. **Listing engine.**
8. **Timegrapher after hardware validation.**
9. **Printing/device workflows.**
10. **Wix/public catalogue and customer Passport.**
11. **Automation and long-term learning loop.**

---

# REAL ORIS ACCEPTANCE LIFECYCLE

The round black-dial Oris remains the end-to-end acceptance object.

- [x] Item created.
- [x] identity seed.
- [x] purchase cost.
- [x] valuation/target/minimum.
- [x] Work created and Workbench persistence tested.
- [x] Item edit persistence.
- [x] media workflow.
- [x] research request/findings workflow.
- [x] Passport.
- [x] Knowledge-backed Movement Finder available from Passport.
- [ ] open movement/case and gather actual calibre evidence.
- [ ] confirm movement identity without guessing.
- [ ] measurements.
- [ ] parts if required.
- [ ] timing if appropriate.
- [ ] QC.
- [ ] Work complete.
- [ ] listing.
- [ ] sale.
- [ ] permanent history/customer-safe Passport output.

**Specific acceptance rule:** never assign calibre 715 to this round Oris without actual evidence. Exact calibre remains unresolved until evidence supports it.

---

# LOCKED PRODUCT DECISIONS

- Top navigation: **Home · Items · Workbench · Business · Calibre**.
- Supabase is the private source of truth.
- Mobile phone and DeX/desktop both matter.
- Passport is Item-level permanent technical data, not a Work record.
- Donor is an Item purpose/relationship.
- Job Card is generated from canonical Item + Work + evidence, not its own database.
- Public/customer site is separate from the private internal app.
- Wix remains a strong candidate for the public storefront.
- Actual cash is distinct from inventory value/potential profit.
- Compatibility is evidence-ranked, never assumed from family alone.
- Candidate movement identity requires explicit human confirmation.
- Timegrapher amplitude remains deferred until validated.

---

# CHANGELOG

## 2026-10-13 — Knowledge, Movement Finder and cleanup status refresh

- Updated roadmap from stale pre-Passport/Research state to current accepted implementation.
- Recorded accepted Media, Passport, Research, v35 Knowledge Engine, Movement Search, Movement Finder and Passport integration.
- Recorded v35 import scale and evidence hierarchy.
- Recorded accepted mobile responsive/card audit.
- Recorded removal of temporary Knowledge portal/MutationObserver routing in favour of direct canonical App rendering.
- Reordered immediate work so Parts/Donors + Storage/QR follows stabilisation.
- Kept remaining Phase 0.5 engineering debt explicit rather than pretending the refactor is finished.

## 2026-10-12 — Master roadmap created

- Consolidated the clean v2 architecture, anti-legacy rules, roadmap, schema gates and long-term workshop direction.
