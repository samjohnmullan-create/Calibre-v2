# Calibre & Co. v2 — Master Roadmap

**Status:** Canonical product and engineering roadmap  
**Last updated:** 14 October 2026  
**Repository:** `samjohnmullan-create/Calibre-v2`  
**Rule:** This document is the source of truth for what Calibre is, what has been accepted, what is partial, what is deferred, and what must be tested before a phase is considered complete.

---

## 1. Product statement

> **Calibre is the operating system for the workshop, inventory, research, commerce and resale business.**

The physical Item is the centre of the system, but Calibre must be capable of running the entire business without requiring a second spreadsheet or shadow database.

**Core lifecycle**

`Acquisition → Identification → Research → Work → Parts → Timing → QC → Valuation → Listing → Sale → Permanent history`

**Business lifecycle**

`Cash out → Stock acquired → Value added → Stock prepared → Sale realised → Costs settled → Profit understood`

**Physical lifecycle**

`Purchase → Receive → Needs put-away → Physical storage → Bench/QC/Dispatch as needed → Return/move → permanent location history`

**Future customer/community lifecycle**

`Customer → Owner → Repeat buyer → Club member → Contributor → Trusted community evidence`

Calibre should reduce workshop friction, preserve evidence, make operational state obvious and provide trustworthy financial answers.

---

## 2. Architectural laws

These are locked unless this roadmap is deliberately amended first.

1. **Item is the physical-object root.**
2. **Work is separate and optional.** One Item may have many Work records.
3. **Physical location is separate from workflow state.** An Item can be in storage, on a bench, in dispatch or unassigned without that changing Work status.
4. **Supabase is authoritative.** Browser state is never the master record.
5. **No resurrection of legacy `jobs`, `currentId`, or one giant mutable business state.**
6. **URLs/deep links identify the thing being viewed.**
7. **Media is uploaded once and reused by context.**
8. **Research produces structured findings with sources, confidence and explicit decisions.**
9. **Accepting evidence and applying it to canonical data are different actions.**
10. **Reference knowledge and bench evidence are distinct.** Published compatibility and a physically confirmed fit are not the same claim.
11. **Costs are transactions; valuations are snapshots; sales are lifecycle records.**
12. **Private internal data is never exposed directly to customers or Club members.**
13. **Generic Item core; specialist watchmaking modules where appropriate.**
14. **Donor is an Item purpose/relationship, not a separate top-level object type.**
15. **AI may propose; it does not silently rewrite accepted facts.**
16. **Unknown stays unknown. No fake precision.**
17. **Schema changes are committed migrations.**
18. **A data-changing feature is not accepted until `change → save → refresh → confirm` succeeds.**
19. **Phone and DeX/desktop are separate acceptance targets.**
20. **Dead implementations are removed after replacement. Git is the archive.**
21. **Business metrics come from underlying records, never hand-entered totals.**
22. **Historical records are immutable where practical.** Completed Work, realised Sales and imported source documents must remain auditable.
23. **Scale is designed in, not retrofitted.** Hundreds or thousands of Items and transactions must remain searchable and performant.
24. **Money must be traceable.** Every financial result must be explainable back to source transactions and allocations.
25. **Operational workflow and accounting truth are separate but linked.** A job status is not a financial transaction; a valuation is not cash.
26. **Purchase is the commercial acquisition event; invoice/document is source evidence; Item remains the physical-object root.**
27. **A bundle/lot may produce multiple physical Items or stock records without losing its acquisition provenance.**
28. **Shared costs must allocate without duplication.** Manual overrides are allowed, but source and allocation must remain explainable.
29. **Parts inventory cost belongs on Parts. Tools are capital/equipment. Consumables are operating spend. Do not double-count them in Item economics and Business Ledger.**
30. **Public/member knowledge is a published projection, never direct database exposure.**
31. **Community contributions are evidence, not automatic truth.**
32. **Commercial membership status and community reputation are separate concepts.**

---

## 3. Current state snapshot — 14 October 2026

Legend: ✅ accepted/working · 🟡 implemented or active but not fully accepted · ⬜ planned · 💤 deliberately deferred · 🧪 exploratory

| Phase | State | Approx. implementation progress | Current reading |
|---|---:|---:|---|
| A — Foundation & scale | 🟡 | ~78% | core pagination/search, audit, backup layers and deployment discipline exist; tests, migration cleanup and restore acceptance remain |
| B — Acquisition | 🟡→✅ | ~96% | invoice → Purchase → Lot → receiving → Item/stock, canonical sources, scalable Purchase search, allocation audit and immutable imported evidence are connected; real save/refresh, physical put-away and finance reconciliation acceptance remain |
| C — Workshop / repair | 🟡→✅ | ~78% | Job Card, templates, parts, QC, storage visibility and completion spine exist; real end-to-end acceptance still required |
| D — Parts / donors / storage | 🟡 | ~78% | parts workflow and first-class physical storage are live; donor intelligence and storage acceptance remain |
| E — Commerce & ledger | 🟡 | ~63% | Item economics, Business Ledger and scalable reporting are live; reversals/refunds and accounting acceptance remain |
| Release Candidate / Main URL | ⬜ | 0% accepted | intentionally held until A–E core exit gates and restore acceptance are satisfied |
| F — Business Brain | 🟡 early | ~15% | dashboard foundation exists; advanced reporting/recommendations later |
| G — Listings & sales engine | 🟡 early | ~15% | Sale records exist; full listing lifecycle/generation incomplete |
| H — Customer / public / Club | 💤 | concept only | later, after internal spine is trustworthy |
| I — Tools / consumables | 🟡 | ~48% | registry, receiving, storage and ledger treatment exist; asset lifecycle/reorder UX remain |
| J — Timegrapher v2 | 💤 | partial capability | deferred until hardware validation |
| K — Printing / physical workflow | 🧪 | exploratory | after storage/QR and release candidate |
| L — Device modes / Smart Capture | 🟡 early | ~30% | phone/DeX shell and phone-first storage flows exist; station workflows later |
| M — Global search / command layer | 🟡 | ~65% | unified indexed search and universal New exist; more domains/actions remain |
| N — Automation / learning loop | 💤 | later | manual workflows first |

**Important:** percentages describe implementation progress, not Definition-of-Done acceptance.

---

## 4. Current implemented capability

### Foundation and UX shell

- ✅ Separate clean Supabase v2 project in Sydney.
- ✅ Workspace/membership model and RLS across core workspace-owned data.
- ✅ Private `calibre-media` bucket and signed media access patterns.
- ✅ Email OTP authentication.
- ✅ Canonical React/TypeScript/Vite app on GitHub Pages.
- ✅ GitHub Verify and Deploy workflows.
- ✅ Responsive Calibre shell for desktop/DeX and phone.
- ✅ Top-level information architecture: Home, Intake, Inventory, Workbench, Business, Library, Settings.
- ✅ Mobile navigation and More menu.
- ✅ Global Search modal.
- ✅ Universal New menu.
- ✅ Item and Work deep links.
- ✅ Core high-volume routes use bounded/server-side loading.
- ✅ Critical Item/Work/financial mutations feed a database-level audit trail.
- ✅ Settings exposes Audit Trail, structured JSON backup and Storage archive.
- ✅ Structured backup now includes Purchase/Lot/link/receiving-exception records and physical storage movement history.
- 🟡 private Storage TAR archive exists but restore acceptance is still outstanding.
- 🟡 Final removal of remaining legacy UI/state patterns is still required.

### Intake / acquisition

- ✅ Dedicated Intake workspace.
- ✅ Explicit Inbox / Ready to Review / Purchases & Receiving / Completed Documents flow.
- ✅ PDF/photo upload and server-side extraction.
- ✅ structured invoice/line extraction and review-before-import.
- ✅ historical AUD conversion.
- ✅ original source document preserved.
- ✅ exact-file and invoice-identity duplicate protection.
- ✅ first-class Purchase model.
- ✅ imported invoice automatically bridges into Purchase.
- ✅ every invoice line becomes a Purchase Lot, including lines deliberately excluded from automatic Item import.
- ✅ excluded lines remain visible as unclassified Lots and can later be classified as Item, Part, Tool or Consumable.
- ✅ Purchase statuses support ordered, shipped, delivered, partially received, received, discrepancy, cancelled and returned.
- ✅ receiving state derives automatically from real received/closed-short/open-exception state.
- ✅ receiving status truth is protected against manual regression once receiving starts; historical non-terminal Purchases are backfilled from Lot/exception truth.
- ✅ manual Purchase entry.
- ✅ multi-Item/bundle splitting.
- ✅ manual shared-cost override.
- ✅ structured receiving exceptions: missing, damaged, wrong item, extra item and other.
- ✅ exception resolve/waive/close-shortfall flow.
- ✅ Purchase → Item and Purchase → stock provenance links.
- ✅ Item receiving can remain in Purchase flow rather than forcing navigation away.
- ✅ Item receiving can leave stock in Needs put-away or assign a real physical location immediately.
- ✅ Parts/Tools/Consumables can be received directly to storage or left unassigned.
- ✅ receiving is quantity-capped and supports partial quantities.
- ✅ Item and stock cost allocation follows the Purchase/Lot.
- ✅ invoice line allocator handles both net-line and already-gross-line invoice formats.
- ✅ historical generated invoice costs were reconciled to Purchase allocation truth.
- ✅ source inconsistencies such as the Gowans #32 two-cent discrepancy are deliberately preserved and explicitly presented rather than silently altered.
- ✅ Purchase list uses server-side pagination, count, status filtering and bounded search.
- ✅ canonical Vendor/Source normalisation and automatic Purchase source linking are enforced in the database; a richer user-facing vendor chooser can improve later.
- ✅ formal allocation/reallocation history records before/after values, reasons, actor/source and timestamp.
- ✅ imported invoice/source truth is read-only after import at both invoice and invoice-line level.

### Inventory / Item workspace

- ✅ Inventory split into Items / Parts / Storage.
- ✅ Item type, purpose, status and physical-location filtering.
- ✅ Needs put-away Item count/filter.
- ✅ server-side Item pagination/count foundation.
- ✅ Item workspace with Overview / Details / Work / Research / Sale / History.
- ✅ Item editing and persistence.
- ✅ Passport and media integrated into Item detail.
- ✅ donor represented as Item purpose rather than separate object type.
- ✅ Item Overview shows full physical storage path and inline Move action.
- ✅ Item History includes physical location movements.
- ✅ Work Job Card shows current physical location and can move/return the Item without changing Work status.
- 🟡 Item archive and primary thumbnails remain incomplete.

### Physical storage

- ✅ first-class hierarchical `storage_locations` model.
- ✅ arbitrary real-world hierarchy rather than hard-coded Workshop root.
- ✅ supports site / room / cabinet / drawer / shelf / box / tray / bin / position / other.
- ✅ Items, Parts, Tools and Consumables can each have a physical location.
- ✅ atomic move RPC records permanent move history.
- ✅ hierarchy-cycle protection.
- ✅ Storage workspace shows contents and counts by location.
- ✅ Needs put-away is a first-class queue, not a fake storage location.
- ✅ combined Needs put-away queue for Items, Parts, Tools and Consumables.
- ✅ fast inline put-away controls.
- ✅ last put-away destination can be reused for repetitive physical sorting.
- ✅ phone-friendly move/put-away interaction.
- ✅ inline expansion pattern keeps move/edit actions inside the current card rather than spawning detached panels.
- 🟡 real save/refresh phone and DeX acceptance still required.
- ⬜ QR-assisted location lookup/moves later.

### Workbench / Job Card

- ✅ Workbench modes for Active / Ready / On Bench / Waiting / QC / Complete.
- ✅ server-side Work pagination, counts and bounded search.
- ✅ Work Job Card is the central operating record.
- ✅ priority, next action, waiting reason, blocker, diagnosis and completion summary.
- ✅ versioned Work Templates and copied checklist steps.
- ✅ Mechanical Service and Mechanical Repair template foundations.
- ✅ measurements and timing runs linked to Work.
- ✅ part needs linked to Work.
- ✅ parts matching embedded in Job Card.
- ✅ reserve → fit evidence → consume → fulfil workflow.
- ✅ QC checklist and completion gate.
- ✅ Work cannot complete while required checklist/parts/QC conditions are unresolved.
- ✅ current physical location visible in Work without coupling storage to Work status.
- 🟡 printable/generated Job Card and customer-safe service summary remain.
- 🟡 formal QC checker identity/sign-off needs hardening.
- 🟡 one real watch must still pass the complete acceptance flow.

### Parts / compatibility / donors

- ✅ Parts inventory foundation.
- ✅ physical storage linkage and direct Part movement.
- ✅ Needs put-away Part queue.
- ✅ compatibility knowledge and movement/application evidence.
- ✅ part needs, allocations and reservations.
- ✅ fit verification evidence.
- ✅ consume/release/fulfil lifecycle.
- ✅ Work can search owned parts for needs.
- 🟡 donor-to-donor / donor-to-Item suggestions need a dedicated UX.
- 🟡 donor depletion and lineage need stronger presentation.

### Research / Library / Knowledge

- ✅ Item research workspace.
- ✅ ChatGPT handoff workflow.
- ✅ structured findings, sources, confidence and decisions.
- ✅ Current / Proposed / Apply / Keep / Ignore bridge.
- ✅ Library consolidated into one research workspace.
- ✅ Movement Search and Movement Finder presented coherently.
- ✅ Compatibility Intelligence available through Library and Item/Work contexts.
- ✅ Knowledge Engine import/admin is separated from normal daily flow.
- ✅ knowledge engine with movements, families, part references, applications, compatibility edges, signals, documents and rules.
- ✅ Calibre Verified bench-evidence layer.
- 🟡 Library administration should ultimately move to Settings.
- 🟡 global search does not yet cover all Knowledge entities.

### Commerce / Item economics

- ✅ Item Sale tab editable.
- ✅ valuation low / expected / high / minimum / target.
- ✅ additional Item costs.
- ✅ channel, listing title/text and asking price.
- ✅ sale price, marketplace fees and shipping to buyer.
- ✅ listed / sold dates and notes.
- ✅ automatic Total Invested / Target Profit / Expected Profit / Actual Profit / ROI presentation.
- ✅ listing/sold status can update Item commercial state.
- ✅ Business Overview / Stock / Listings / Sales / Costs.
- ✅ Business totals use server-side summaries and paginated lists.
- ✅ invoice/Purchase economics reconcile into Item cost foundations.
- 🟡 refunds, discounts, reversals and deeper auditability remain.

### Business Ledger

- ✅ separate `business_ledger_entries` model.
- ✅ operating expense / capital spend / other income treatment.
- ✅ categories for tools/equipment/consumables/subscriptions/packaging/postage/software/marketing/banking/training/storage/other activity.
- ✅ vendor / receipt-reference / date / notes.
- ✅ source currency and optional AUD equivalent.
- ✅ add / edit / delete / search / filter UX.
- ✅ server-side summaries and paginated loading.
- ✅ Tool receiving creates capital/equipment ledger treatment.
- ✅ Consumable receiving creates operating-spend ledger treatment.
- ✅ Part receiving keeps stock cost on Parts rather than duplicating it into Business Ledger.
- 🟡 strict append-oriented correction/reversal policy is not yet enforced.

### Global search / actions

- ✅ unified indexed search across Items, Work, Parts and Invoices.
- ✅ maker/model/reference/serial evidence participates in Item search.
- ✅ bounded category results.
- ✅ global New actions for Item, Invoice, Part and Work handoff.
- 🟡 Knowledge, Tools, Consumables, Sales, Ledger, donors and locations remain to be added.
- 🟡 command actions beyond navigation remain limited.

### Data protection / recovery

- ✅ structured workspace export with deterministic pagination, row counts and SHA-256 checksum.
- ✅ Purchase acquisition child records included in structured backup.
- ✅ storage locations and permanent physical movement history included in structured backup.
- ✅ media/document Storage paths preserved in export manifest.
- 🟡 private `calibre-media` TAR archive exists with per-file checksums; live restore verification remains.
- ✅ recovery runbook exists.
- ⬜ clean migration rebuild and full disposable restore drill still need to pass.
- ⬜ restored finance totals and private media/document links still need reconciliation.
- 💤 Supabase branch-based restore drill is currently blocked by paid-plan requirements and is parked rather than repeatedly pursued.

### Device / deployment state

- ✅ Galaxy phone and DeX-responsive shell.
- ✅ current v2 deploys to GitHub Pages preview.
- ✅ Vite build prepared for preview path or future custom domain.
- ✅ `app.calibreco.com.au` remains on the original `CalibreOI` repo as rollback.
- ⬜ custom-domain cutover intentionally deferred until Release Candidate gate.

---

# DELIVERY ORDER

`Foundation & Scale → Acquisition acceptance → Workshop acceptance → Parts/Storage acceptance → Commerce/Ledger hardening → RELEASE CANDIDATE / MAIN URL → Business Brain → Listings → Customer/Public/Club → Automation & Hardware`

---

## Phase A — Business-grade foundation and scale

**Status: 🟡 active and mandatory before release candidate**

### Data and engineering

- [ ] generate and commit Supabase TypeScript database types;
- [x] recent schema changes committed as repository migrations;
- [ ] complete older live-vs-repo migration audit;
- [ ] define clearer service/data-access boundaries;
- [ ] continue decomposing oversized UI components;
- [x] CI build/verification workflow;
- [ ] focused regression tests for critical workflows;
- [ ] RLS/security acceptance tests;
- [ ] error observability/system-health diagnostics;
- [x] duplicate/idempotency protection for invoice intake;
- [🟡] idempotent Purchase/receiving RPCs exist; broader retry discipline still needs review.

### Scale

- [x] core Items, Workbench, Business and Ledger bounded/server-paginated;
- [x] indexed search/filter groundwork in key domains;
- [x] Home summaries server-bounded;
- [x] Global Search unified and bounded;
- [ ] saved views;
- [🟡] secondary routes still need unbounded-loading audit;
- [ ] primary thumbnails in high-volume lists;
- [x] deterministic Work numbering;
- [ ] deterministic Item numbering acceptance;
- [ ] archive-not-delete policy across all material business records.

### Audit / resilience

- [🟡] audit trail exists for critical domains; remaining acquisition/storage audit coverage should be reviewed;
- [x] portable structured export;
- [x] Storage TAR export implementation;
- [x] Purchase/receiving/storage-history tables included in structured backup;
- [ ] real restore drill before main-domain cutover;
- [ ] error observability for failed writes/background work.

**Exit gate:** representative scale must remain fast and trustworthy on phone/DeX, and recovery must be proven before business-critical cutover.

---

## Phase B — Acquisition and inventory operations

**Status: 🟡→✅ ~96% implemented; real acceptance remains**

Goal: every purchase enters Calibre once and remains traceable from source evidence to physical stock and final sale.

### Acquisition model

- [x] invoice document intake;
- [x] structured extraction/review/import;
- [x] AUD conversion;
- [x] original document preserved;
- [x] duplicate protection;
- [x] first-class Purchase record integrated with invoice intake;
- [x] canonical Vendor/Source normalisation and automatic Purchase linkage;
- [x] coherent order/invoice/lot references;
- [x] ordered / shipped / delivered / partially received / received / discrepancy / cancelled / returned states;
- [x] receiving status is derived from real receiving evidence and cannot regress to a pre-receipt logistics state once receiving begins;
- [x] multi-Item lots and bundles;
- [x] manual Purchase entry;
- [x] structured receiving exceptions;
- [x] partial quantities and closed-shortfall handling;
- [x] excluded invoice lines preserved as unclassified Purchase Lots;
- [x] safe pre-receiving Lot classification;
- [x] Item / Part / Tool / Consumable receiving;
- [x] receive directly to location or Needs put-away;
- [🟡] explicit received-date/physical-intake semantics need real-world acceptance.

### Cost allocation

- [x] line purchase cost to Item/stock;
- [x] buyer premium/postage/shared allocation;
- [x] proportional allocation;
- [x] manual shared-cost override;
- [x] original currency and AUD basis preserved;
- [x] adaptive gross-vs-net invoice-line allocation;
- [x] historical generated invoice-cost reconciliation;
- [x] formal allocation/reallocation history;
- [x] explicit source-financial-discrepancy presentation.

### Scale / integrity remaining

- [x] server pagination/search for Purchases;
- [x] canonical Vendor/Source normalisation;
- [x] imported-source immutability after import;
- [ ] real save → refresh acceptance across invoice → Purchase → receiving → put-away;
- [ ] finance reconciliation acceptance on representative real purchases.

**Exit gate:** every physical Item/stock record can answer “where did I buy it, what did it really cost, what did I actually receive, and where is it now?”

---

## Phase C — Workshop / repair operations

**Status: 🟡 advanced implementation; acceptance pass still required**

- [x] dedicated Job Card;
- [x] diagnosis/fault notes;
- [x] next action/blocker/priority;
- [x] measurements/timing/parts linkage;
- [x] completion summary;
- [x] physical location visible and movable without changing Work state;
- [x] versioned templates/checklists;
- [x] QC gate;
- [ ] formal QC checker identity/sign-off;
- [ ] printable/generated Job Card;
- [ ] customer-safe service summary;
- [ ] one real watch end-to-end acceptance on phone and DeX.

---

## Phase D — Parts, donors and physical storage

**Status: 🟡 ~78% implemented**

### Parts

- [x] stock inventory foundation;
- [x] condition/provenance/acquisition-cost foundations;
- [x] donor linkage;
- [x] compatibility evidence and bench-fit verification;
- [x] reservation/allocation/consume/release/fulfil;
- [x] physical location assignment/movement;
- [x] Needs put-away queue;
- [🟡] failed-fit/returned presentation can improve.

### Donors

- [🟡] donor relationships/inventory foundation exists;
- [ ] proactive compatible-donor suggestions;
- [ ] clear donor lineage/history;
- [ ] donor depletion visibility.

### Physical storage

Hierarchy is deliberately generic, for example:

`Site → Zone/Room → Cabinet → Drawer → Tray/Bin → Position`

- [x] arbitrary hierarchy creation;
- [x] Items/Parts/Tools/Consumables can share the same location model;
- [x] atomic move workflow;
- [x] permanent location history;
- [x] Needs put-away queue;
- [x] phone-friendly inline moves;
- [x] Job Card location visibility and return-to-previous-location flow;
- [ ] phone + DeX save/refresh acceptance pass;
- [ ] QR lookup/moves later.

**Rule:** family similarity is a lead, not proof of fit.

---

## Phase E — Commerce and proper financials

**Status: 🟡 meaningful implementation exists; accounting hardening remains**

### Item commerce

- [x] acquisition cost projection;
- [x] allocated shared costs;
- [x] additional Item costs;
- [x] valuation snapshots;
- [x] target/minimum/list price;
- [x] sale lifecycle;
- [x] fees and outbound shipping;
- [x] invested / expected / target / realised profit / ROI;
- [ ] refunds/discounts/reversals;
- [ ] margin/reporting consistency.

### Business Ledger

- [x] first-class ledger;
- [x] operating / capital / other income treatment;
- [x] tools/equipment separated from Item economics;
- [x] consumable/tool receiving can create correct ledger treatment;
- [x] Part receiving avoids duplicate ledger treatment;
- [x] foreign currency + optional AUD equivalent;
- [x] server-side summaries/pagination;
- [ ] owner contributions/drawings if required;
- [ ] formal adjustment/reversal workflow.

### Accounting principles

- [x] stock costs and operating expenses structurally distinguishable;
- [x] realised cash and hypothetical valuation separate;
- [x] totals computed from records;
- [x] critical finance mutations audited;
- [🟡] destructive edit/delete still exists in Ledger UI;
- [ ] representative end-to-end finance reconciliation acceptance.

---

# RELEASE CANDIDATE / MAIN URL CUTOVER GATE

**Status: ⬜ deliberately not rushed**

`app.calibreco.com.au` stays on the original app until the operational and financial spine is demonstrably safer to run than legacy.

Required before cutover:

1. [ ] one complete real-world workflow succeeds: purchase → Item → research → Work → parts → QC → valuation/listing → sale → financial result;
2. [ ] save → refresh → confirm passes on all critical writes;
3. [ ] phone acceptance pass;
4. [ ] DeX/desktop acceptance pass;
5. [🟡] core high-volume routes scale; secondary routes still need review;
6. [x] structured backup and Storage archive layers exist;
7. [ ] real database/media restore drill succeeds;
8. [ ] invoice/Purchase → Item cost → Business reporting reconciliation succeeds;
9. [ ] remaining legacy active-route leakage removed;
10. [ ] rollback plan documented and old app frozen, not deleted;
11. [ ] final Verify and Deploy green;
12. [ ] custom-domain routing/auth/private-media/write validation.

---

## Phase F — Business Brain

**Status: 🟡 early foundation**

Already present: Business Overview, stock invested, target/expected value, projected gross, realised-profit groundwork, ready-to-sell/needs-valuation/aged-stock indicators, Item cost breakdown and separate Ledger summaries.

Still to mature:

- [ ] cash position with clearly defined scope;
- [ ] stock at cost / capital tied up;
- [ ] expected vs realised profit;
- [ ] revenue/profit by period and monthly P&L;
- [ ] average margin / ROI / days to sale;
- [ ] most/least profitable Items;
- [ ] slow/dead stock scoring;
- [ ] incoming purchases/parts;
- [ ] sale-ready prioritisation;
- [ ] waiting Work/blockers;
- [ ] tool vs stock expenditure;
- [ ] advisory “what should I work on next?” reasoning.

---

## Phase G — Listing and sales engine

**Status: 🟡 early foundation**

- [🟡] sale/listing record foundation;
- [ ] true multiple listings/channels per Item;
- [x] listed date / asking price / channel;
- [ ] external listing URL;
- [🟡] offer records exist;
- [ ] accepted/rejected/countered offer workflow;
- [x] sale conversion foundation;
- [ ] channel-specific listing generation;
- [ ] image selection/order;
- [ ] publication checklist;
- [ ] sold/archive/post-sale handoff.

Never invent water resistance, service state, originality or technical certainty.

---

## Phase H — Customer, public and Calibre Club

**Status: 💤 later**

Customer/member access must come from an explicitly sanitised publication projection, never direct internal tables.

Future outputs include customer-safe Passport, repair report, invoice/receipt, public catalogue, Wix/customer-site integration, QR provenance, owned-watch area and optional Club/community evidence workflows.

---

## Phase I — Tools, consumables and workshop registry

**Status: 🟡 foundation now meaningful**

- [x] Tool registry;
- [x] Consumable registry;
- [x] Purchase receiving can materialise Tools/Consumables;
- [x] physical storage linkage and put-away;
- [x] Business Ledger treatment distinguishes Tool capital spend and Consumable operating spend;
- [ ] service/calibration dates where relevant;
- [ ] low-stock/reorder workflow;
- [ ] richer asset lifecycle/reporting.

---

## Phase J — Timegrapher v2

**Status: 💤 deferred until dedicated mic/hardware is validated**

- [x] sample-clock / AudioWorklet timing foundation;
- [x] BPH;
- [x] rate;
- [x] beat error;
- [🟡] persistent timing runs;
- [ ] richer positional workflow;
- [ ] before/after comparison;
- [ ] hardware-specific calibration/validation.

Amplitude remains disabled until defensible.

---

## Phase K — Printing and physical workflow

**Status: 🧪 explore after core acceptance**

Preferred direction: browser/PDF outputs plus a desktop Print Bridge for hardware that phones cannot drive directly.

Potential outputs: Item labels, storage labels, Job Cards, repair reports, invoices/receipts and QR Passport labels.

---

## Phase L — Device modes / Smart Capture

**Status: 🟡 early foundations**

- phone: status, photos, measurements, parts, storage/put-away, QR;
- DeX: research, finance, comparisons, dense admin;
- capture station: microscope/camera capture against a selected Item.

Dedicated capture-station workflows remain future work.

---

## Phase M — Global search / command layer

**Status: 🟡 active**

### Search now

- [x] Items;
- [x] Work;
- [x] Parts;
- [x] Invoices;
- [ ] movement/calibre Knowledge;
- [ ] donors;
- [ ] locations;
- [ ] vendors/sources;
- [ ] ledger transactions;
- [ ] listings/offers/sales;
- [ ] tools/consumables.

### Command actions

- [x] open/create Item;
- [x] open Invoice intake;
- [x] add Part;
- [🟡] start Work handoff;
- [ ] move Work;
- [ ] add cost/ledger entry;
- [ ] put away/move physical stock from global command;
- [ ] locate donor;
- [ ] start named Work template;
- [ ] open linked source document.

---

## Phase N — Automation and learning loop

**Status: 💤 after manual workflows are proven**

Potential automation: purchase email/invoice capture, shipment/arrival, stale Work alerts, auction intake, listing/publication, finance summaries, reorder warnings and scheduled business briefs.

---

# CROSS-CUTTING GATES

## Scale and performance

Core Home, Inventory, Workbench, Business/Ledger, Global Search and Purchase intake are bounded/server-paginated where appropriate. Secondary long-tail routes still need scale review.

## Timeline/history

Business lifecycle history and low-level audit logging remain distinct. Storage moves are now a permanent user-facing physical-history source.

## Backups/recovery

Structured JSON export, Storage TAR export and written recovery runbook exist. The structured export includes acquisition child records and storage movement history. A successful restore/reconciliation drill remains mandatory before main-domain cutover.

## Security

RLS on workspace-owned data; least privilege; no frontend secrets; signed private media; explicit publication boundary; no direct member access to internal operational tables.

## Financial integrity

- no profit without transactions;
- no cash position from valuations;
- no silent allocation changes;
- original currency preserved;
- material financial changes auditable;
- Business Ledger and Item/stock economics must not double-count costs;
- source discrepancies stay visible rather than being quietly “fixed”.

## Physical integrity

- location is independent of Work/status;
- Needs put-away means unassigned, not “Workshop”;
- physical moves are explicit and historical;
- receiving can assign storage, but does not have to;
- moving to Bench never starts Work automatically.

## Phone / DeX acceptance

Every operational phase must be usable on phone and DeX/desktop before acceptance.

## Design language

Keep the accepted Swiss technical-instrument / old-steel / workshop direction. Prefer inline expansion over detached action panels when editing/moving a specific card or row.

---

# IMMEDIATE EXECUTION PLAN

### 1. Acquisition acceptance and scale hardening

- [x] server pagination/search for Purchases;
- [x] canonical Vendor/Source treatment;
- [x] formal source discrepancy presentation;
- [x] formal allocation/reallocation history;
- [x] imported-source immutability rules;
- [x] receiving-status truth/backfill and regression protection;
- [ ] real invoice → Purchase → receiving → put-away save/refresh acceptance;
- [ ] representative Purchase finance reconciliation acceptance.

### 2. Workshop acceptance

- [ ] run one real watch end-to-end through current Work/QC/storage system;
- [ ] formal QC signer identity;
- [ ] Work timeline polish;
- [ ] printable/generated Job Card;
- [ ] customer-safe completion summary.

### 3. Parts / donor intelligence

- [ ] donor suggestions;
- [ ] donor lineage/depletion;
- [ ] failed-fit/returned presentation;
- [ ] real storage acceptance on phone and DeX;
- [ ] later QR move/lookup.

### 4. Foundation hardening

- [ ] generate DB types;
- [ ] finish live-vs-repo migration audit;
- [ ] regression/RLS tests;
- [ ] secondary-route scale audit;
- [ ] error observability;
- [ ] execute clean rebuild + restore drill when a practical disposable environment is available.

### 5. Commerce / ledger hardening

- [ ] refunds / discounts / adjustments;
- [ ] reversal-based correction path;
- [ ] margin/reporting consistency;
- [ ] finance reconciliation tests.

### 6. Release Candidate / main URL

Only after A–E core exit gates are satisfied. Do not cut over early.

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
11. performance is acceptable at intended scale;
12. financial calculations can be traced to source records;
13. no legacy duplicate implementation remains active on the accepted route;
14. backup/recovery requirements are satisfied before business-critical cutover;
15. public/member access uses a sanitised publication boundary;
16. physical-location behaviour is explicit where relevant;
17. the roadmap is updated to reflect accepted reality.
