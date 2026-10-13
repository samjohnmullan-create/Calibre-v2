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

**Future customer/community lifecycle**

`Customer → Owner → Repeat buyer → Club member → Contributor → Trusted community evidence`

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
11. **Private internal data is never exposed directly to customers or Club members.**
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
25. **Public/member knowledge is a published projection, never direct database exposure.**
26. **Community contributions are evidence, not automatic truth.** They require provenance, confidence and verification before becoming canonical or Calibre Verified.
27. **Commercial membership status and community reputation are separate concepts.** High spend does not automatically make a user a trusted technical contributor.

---

## 3. Current state snapshot — 14 October 2026

Legend: ✅ accepted/working · 🟡 implemented or active but not fully accepted · ⬜ planned · 💤 deliberately deferred · 🧪 exploratory

| Phase | State | Approx. implementation progress | Current reading |
|---|---:|---:|---|
| A — Foundation & scale | 🟡 | ~55% | strong foundation; scale, backup, audit and cleanup remain |
| B — Acquisition | 🟡 | ~65% | invoice workflow strong; broader purchase/lot workflow incomplete |
| C — Workshop / repair | 🟡→✅ | ~75% | Job Card, templates, parts, QC and completion spine now exists |
| D — Parts / donors / storage | 🟡 | ~60% | matching/allocation strong; donor intelligence and storage still incomplete |
| E — Commerce & ledger | 🟡 | ~55% | Item economics and Business Ledger now live; accounting hardening remains |
| Release Candidate / Main URL | ⬜ | 0% accepted | intentionally held until A–E core exit gates are satisfied |
| F — Business Brain | 🟡 early | ~15% | dashboard foundation exists; advanced reporting/recommendations later |
| G — Listings & sales engine | 🟡 early | ~15% | Sale records exist; full listing lifecycle/generation incomplete |
| H — Customer / public / Club | 💤 | concept only | later, after internal spine is trustworthy |
| I — Tools / consumables | 🟡 | ~35% | schema and workshop inventory foundations exist |
| J — Timegrapher v2 | 💤 | partial legacy capability | deferred until hardware validation |
| K — Printing / physical workflow | 🧪 | exploratory | after storage/QR and release candidate |
| L — Device modes / Smart Capture | 🟡 early | ~25% | phone/DeX shell exists; station workflows later |
| M — Global search / command layer | 🟡 | ~50% | global search and universal New exist; more domains/actions needed |
| N — Automation / learning loop | 💤 | later | manual workflows first |

**Important:** percentages describe implementation progress, not Definition-of-Done acceptance.

---

## 4. Current accepted / implemented capability

### Foundation and UX shell

- ✅ Separate clean Supabase v2 project in Sydney.
- ✅ Workspace/membership model and RLS across core workspace-owned data.
- ✅ Private `calibre-media` bucket and signed media access patterns.
- ✅ Email OTP authentication.
- ✅ Canonical React/TypeScript/Vite app on GitHub Pages.
- ✅ GitHub Verify and Deploy workflows.
- ✅ Responsive Calibre shell for desktop/DeX and phone.
- ✅ Top-level information architecture: Home, Intake, Inventory, Workbench, Business, Library.
- ✅ Mobile navigation and More menu.
- ✅ Global Search modal.
- ✅ Universal New menu.
- ✅ Item and Work deep-link handling.
- ✅ New UI routes coexist during migration while legacy surfaces are progressively retired.
- 🟡 Final removal of remaining legacy UI/state patterns is still required.

### Home

- ✅ Operational Home dashboard.
- ✅ Work, Intake and sale-readiness summaries.
- ✅ needs-attention and recent activity surfaces.
- 🟡 server-side counts/pagination and better chronology remain.

### Intake / acquisition invoices

- ✅ Dedicated Intake workspace.
- ✅ PDF/photo upload.
- ✅ server-side invoice extraction.
- ✅ structured invoice/line extraction.
- ✅ historical AUD conversion.
- ✅ review-before-import.
- ✅ imported source document linked to created Items without duplication.
- ✅ exact-file SHA-256 duplicate protection.
- ✅ vendor + invoice number + date duplicate protection.
- ✅ duplicate Hannams records quarantined from active finance truth.
- ✅ invoice line economics now project into Item costs.
- ✅ buyer premium/postage/shared invoice charges can be proportionally allocated to imported Items.
- ✅ imported Items can be opened directly after import.
- 🟡 Intake queue semantics still need a proper Ready to Review / Completed model.
- 🟡 broader Purchase / Lot / shipment / received model remains.

### Inventory / Item workspace

- ✅ Inventory split into Items / Parts / Workshop views.
- ✅ Item type, purpose and status filtering.
- ✅ Item workspace with Overview / Details / Work / Research / Sale / History.
- ✅ Item editing and persistence.
- ✅ Passport integrated into Item detail.
- ✅ photos/media integrated into Item workspace.
- ✅ donor represented as Item purpose rather than separate object type.
- 🟡 Item archive, physical location summary, server pagination and primary thumbnails remain.

### Workbench / Job Card

- ✅ Workbench modes for Active / Ready / On Bench / Waiting / QC / Complete.
- ✅ Work Job Card is the central operating record.
- ✅ Work priority, next action, waiting reason, blocker, diagnosis and completion summary fields.
- ✅ versioned Work Templates and copied Work checklist steps.
- ✅ Mechanical Service and Mechanical Repair template foundations.
- ✅ checklist status/notes flow.
- ✅ measurements and timing runs linked to Work.
- ✅ part needs linked to Work.
- ✅ parts matching embedded in Job Card rather than a separate Parts Desk.
- ✅ reserve → fit evidence → consume → fulfil workflow.
- ✅ QC checklist and completion gate.
- ✅ Work cannot complete while required checklist/parts/QC conditions are unresolved.
- 🟡 printable/generated Job Card and customer-safe service summary remain.
- 🟡 formal QC checker identity/sign-off needs hardening.

### Parts / compatibility / donors

- ✅ Parts inventory foundation.
- ✅ compatibility knowledge and movement/application evidence.
- ✅ part needs, allocations and reservations.
- ✅ fit verification evidence.
- ✅ consume/release/fulfil lifecycle.
- ✅ Work can search owned parts for needs.
- 🟡 donor-to-donor / donor-to-Item suggestions need a dedicated UX.
- 🟡 donor depletion and lineage need stronger presentation.
- 🟡 physical storage hierarchy is not complete.

### Research / Library / Knowledge

- ✅ Item research workspace.
- ✅ ChatGPT handoff workflow.
- ✅ structured findings, sources, confidence and decisions.
- ✅ Current / Proposed / Apply / Keep / Ignore bridge.
- ✅ Library consolidated into one research workspace.
- ✅ Movement Search and Movement Finder presented as one coherent research area.
- ✅ Compatibility Intelligence available through Library and Item/Work contexts.
- ✅ Knowledge Engine import/admin moved out of normal daily flow and collapsed as administration.
- ✅ v35 knowledge engine with movements, families, part references, applications, compatibility edges, signals, documents and rules.
- ✅ Calibre Verified bench-evidence layer.
- 🟡 Library administration should ultimately move to Settings.
- 🟡 global search does not yet cover all Knowledge entities.

### Commerce / Item economics

- ✅ Item Sale tab is editable.
- ✅ valuation low / expected / high / minimum / target.
- ✅ additional Item costs.
- ✅ channel / marketplace, listing title/text and asking price.
- ✅ sale price, marketplace fees and shipping to buyer.
- ✅ listed / sold dates and notes.
- ✅ automatic Total Invested / Target Profit / Expected Profit / Actual Profit / ROI presentation.
- ✅ listing/sold status can update Item commercial state.
- ✅ Business Overview / Stock / Listings / Sales / Costs.
- ✅ Hannams invoice economics reconcile into Business stock/cost figures.
- 🟡 refunds, discounts, reversals and deeper auditability remain.

### Business Ledger

- ✅ separate `business_ledger_entries` model for whole-business economics.
- ✅ operating expense / capital spend / other income treatment.
- ✅ categories for tools, equipment, consumables, subscriptions, packaging, postage, software, marketing, banking, training, storage and other business activity.
- ✅ vendor / receipt-reference / date / notes.
- ✅ source currency and optional AUD equivalent.
- ✅ add / edit / delete / search / filter UX.
- ✅ Operating Spend / Capital Spend / Other Income / Net Cash Impact summaries.
- ✅ RLS and authenticated workspace permissions.
- ✅ indexing and duplicate/import groundwork through `external_key`.
- 🟡 append-oriented corrections/reversal policy is not fully enforced.
- 🟡 stock purchase and business ledger reconciliation policy needs final acceptance.

### Global search / actions

- ✅ global search across Items, Work, Parts and Invoices.
- ✅ global New actions for Item, Invoice, Part and Work handoff.
- 🟡 Knowledge, tools, consumables, sales, transactions, donors and locations remain to be added.
- 🟡 command actions beyond navigation are still limited.

### Device / deployment state

- ✅ Galaxy phone and DeX-responsive shell.
- ✅ current v2 deploys successfully to GitHub Pages.
- ✅ v2 Vite build has been prepared to work from either the preview path or a future custom domain.
- ✅ existing production URL `app.calibreco.com.au` remains attached to the original `CalibreOI` repo.
- ✅ old app therefore remains available as rollback while v2 matures.
- ⬜ custom-domain cutover intentionally deferred until the Release Candidate gate.

---

# DELIVERY ORDER

The delivery order remains business-first, with an explicit release gate added:

`Foundation & Scale → Acquisition → Workshop → Parts & Storage → Commerce & Ledger → RELEASE CANDIDATE / MAIN URL → Business Brain → Listings → Customer/Public/Club → Automation & Hardware`

---

## Phase A — Business-grade foundation and scale

**Status: 🟡 active and mandatory before release candidate**

Goal: make Calibre safe to operate with hundreds or thousands of Items, Work records and transactions.

### Data and engineering

- [ ] generate and commit Supabase TypeScript database types;
- [x] core recent schema changes committed as repository migrations;
- [ ] complete audit of older live-vs-repo migration gaps;
- [ ] define canonical service/data-access boundaries;
- [ ] continue decomposing oversized UI components;
- [x] CI typecheck/build workflow;
- [ ] focused regression tests for critical workflows;
- [ ] RLS/security acceptance tests;
- [ ] internal system-health diagnostics where useful;
- [x] idempotency/duplicate protection for invoice uploads and invoice business identity;
- [ ] broader idempotent write patterns for imports, automation and retries.

### Scale

- [ ] server-side pagination for Items, Work, transactions and Files;
- [x] indexed search/filter groundwork in key domains;
- [ ] saved views for common operating states;
- [ ] avoid N+1 queries and unbounded client loading;
- [ ] primary thumbnails in high-volume lists;
- [x] deterministic Work numbering through generated identity;
- [ ] deterministic Item numbering rules acceptance;
- [ ] archive rather than hard delete for all important business records.

### Audit / resilience

- [🟡] user-facing lifecycle history exists in early Item form but is incomplete;
- [ ] backend audit trail for critical financial and operational mutations;
- [ ] database/media backup policy;
- [ ] export path for critical business data;
- [ ] real restore drill before main-domain cutover;
- [x] duplicate detection for invoice/import workflow;
- [ ] error observability for failed writes and background tasks.

**Exit gate:** a few hundred Items must remain fast and trustworthy on phone and DeX, and a restore drill must succeed before Calibre becomes business-critical.

---

## Phase B — Acquisition and inventory operations

**Status: 🟡 strong invoice workflow; broader acquisition model incomplete**

Goal: every purchase enters Calibre once and remains traceable from source document to physical Item and final sale.

### Acquisition model

- [x] invoice document intake;
- [x] structured extraction/review/import;
- [x] AUD conversion;
- [x] original document preserved and linked to Item;
- [x] invoice duplicate protection;
- [ ] first-class Purchase record fully integrated with invoice intake;
- [ ] vendor / auction house / source linkage;
- [🟡] order/invoice/lot references exist in pieces but need one coherent model;
- [ ] incoming / in transit / received / discrepancy states;
- [ ] multi-Item lots and bundles;
- [ ] manual purchase entry for non-invoice acquisitions;
- [ ] received date and physical intake confirmation.

### Cost allocation

- [x] line purchase cost to Item;
- [x] allocation of buyer premium, postage and shared invoice charges;
- [x] default proportional allocation by line value;
- [ ] manual allocation override;
- [x] preserve original currency and AUD basis on invoice/acquisition data;
- [ ] allocation audit trail and reallocation history.

### Inventory operations

- [x] universal create-item flow;
- [ ] Item archive flow;
- [ ] physical location summary;
- [ ] primary image in Item list/header;
- [ ] server-side search and filters;
- [🟡] operational status views exist across Home/Inventory/Workbench but Incoming/Received need dedicated support.

**Exit gate:** every physical Item can answer “where did I buy it, what did it really cost, and where is it now?”

---

## Phase C — Workshop / repair operations

**Status: 🟡 advanced implementation; acceptance pass still required**

Goal: run a repair/service job start-to-finish from Calibre.

### Work record

- [x] dedicated Job Card operating view;
- [x] diagnosis/fault notes;
- [🟡] Work events/timeline infrastructure exists; presentation remains incomplete;
- [x] next action/blocker/priority;
- [x] linked measurements;
- [x] linked timing runs;
- [🟡] Work media linkage exists through Item/media model; dedicated roles can improve;
- [x] parts required / allocated / used;
- [x] completion summary;
- [ ] printable/generated Job Card.

### Versioned Work Templates

- [x] versioned template model;
- [x] template steps copied into Work on start;
- [x] Mechanical Service template foundation;
- [x] Mechanical Repair template foundation;
- [ ] quartz service template;
- [ ] clean & inspect template;
- [ ] crystal replacement template;
- [ ] balance repair template;
- [ ] mainspring replacement template;
- [ ] regulation-only template;
- [ ] case restoration template;
- [ ] diagnostic inspection template;
- [ ] customer repair template.

Checklist steps now support core status and notes; richer per-step media/measurement presentation can continue later.

### QC gate

- [x] explicit QC checklist;
- [x] required QC items before completion where applicable;
- [x] completion gate blocks unresolved required checklist/parts/QC conditions;
- [x] final timing/functional records can be linked;
- [ ] formal checker identity/sign-off hardening;
- [ ] customer-safe service summary generated separately from internal notes.

**Exit gate:** one real watch must be taken from intake through service and QC without external notes, then re-opened after refresh and still tell the complete story.

---

## Phase D — Parts, donors and physical storage

**Status: 🟡 parts workflow strong; storage/donor UX incomplete**

Goal: know what parts exist, where they are, what may fit and what actually fitted.

### Parts

- [x] stock inventory foundation;
- [x] condition/provenance fields foundation;
- [x] donor Item linkage foundation;
- [x] measurements infrastructure;
- [🟡] storage location schema exists; operational storage UX incomplete;
- [x] acquisition cost foundation;
- [x] compatibility evidence;
- [x] actual bench-fit verification;
- [x] allocation/reservation to Work;
- [x] consumed / released / fulfilled workflow;
- [🟡] failed-fit / returned presentation can be improved.

### Donors

- [🟡] donor relationships/inventory foundation exists;
- [ ] automatic compatible-donor suggestions surfaced proactively;
- [ ] preserve donor lineage/history in a clear Item view;
- [ ] donor depletion visibility.

### Physical storage

Hierarchy target:

`Workshop → Cabinet → Drawer → Tray → Position`

- [ ] assign/move Items and parts through the hierarchy;
- [ ] location history;
- [ ] low-friction phone move flow;
- [ ] QR lookup/moves later.

**Rule:** family similarity is a lead, not proof of fit.

---

## Phase E — Commerce and proper financials

**Status: 🟡 active; meaningful implementation now exists**

Goal: make every Item’s financial result explainable and build the ledger needed to run the business.

### Item commerce

`Acquisition → Added costs → Valuation → Listing → Offers → Sale → Realised result`

- [x] acquisition cost projection from Invoice;
- [x] allocated premium/postage/shared invoice charges;
- [x] parts/materials and additional Item costs;
- [x] external service / packaging / postage categories supported through Item costs;
- [x] valuation snapshots;
- [x] target/minimum/list price;
- [x] sale lifecycle record;
- [x] selling fees;
- [x] outbound shipping-to-buyer;
- [ ] refunds/discounts/reversals;
- [x] total invested;
- [x] gross/target/expected profit views;
- [x] realised net profit;
- [x] ROI %;
- [x] days-held groundwork in Business Stock;
- [ ] margin % presentation and reporting consistency across all sale views.

### Business ledger

- [x] first-class business ledger table;
- [x] operating / capital / other-income treatment;
- [x] tools/equipment expense separation from Item economics;
- [x] consumables / subscriptions / postage / software / marketing / banking / training / storage / other categories;
- [x] vendor, reference, date and notes;
- [x] foreign currency + optional AUD equivalent;
- [x] Ledger UX with add/edit/delete/search/filter;
- [x] Operating Spend / Capital Spend / Other Income / Net Cash Impact summaries;
- [ ] owner contributions/drawings explicit workflow if required;
- [ ] automatic integrations from purchase/tool workflows where useful;
- [ ] formal adjustment/reversal workflow.

### Accounting principles

- [🟡] ledger is structurally auditable, but UI still permits edits/deletes rather than strict append-only correction;
- [x] tools/equipment are not silently allocated as watch costs;
- [x] stock costs and operating expenses are distinguishable;
- [x] realised cash and hypothetical valuation are presented separately;
- [x] financial totals are computed from records, not hand-entered summary totals;
- [x] foreign currency source amount/AUD basis supported in core acquisition/ledger paths;
- [ ] corrections use reversal/adjustment records where practical rather than destructive edits.

**Exit gate:** an Item and the overall business can both explain where every material dollar came from or went, and invoice → Item → Business reconciliation succeeds on real data.

---

# RELEASE CANDIDATE / MAIN URL CUTOVER GATE

**Status: ⬜ deliberately not rushed**

This sits **after Phase E and before Phase F**.

The main custom URL `app.calibreco.com.au` should move from the original `CalibreOI` app to `Calibre-v2` only when the operational and financial spine is trustworthy. Business Brain, advanced listings, Club/community and hardware features do **not** need to be finished first.

Required before cutover:

1. [ ] one complete real-world workflow succeeds: purchase → Item → research → Work → parts → QC → valuation/listing → sale → financial result;
2. [ ] save → refresh → confirm pass on all critical writes;
3. [ ] phone acceptance pass on the complete core workflow;
4. [ ] DeX/desktop acceptance pass on the complete core workflow;
5. [ ] server-side pagination/search foundation is in place for high-volume records;
6. [ ] backup/export policy exists;
7. [ ] a real database/media restore drill succeeds;
8. [ ] invoice → Item cost → Business reporting reconciliation succeeds;
9. [ ] remaining obvious legacy UI/state leakage is removed from active routes;
10. [ ] rollback plan is documented and the old app is frozen, not deleted;
11. [ ] final Verify and Deploy are green;
12. [ ] custom-domain switch is tested for routing, assets, Supabase auth and private media.

**Cutover principle:** do not switch because v2 looks newer; switch because v2 is safer and more coherent to operate than the old app.

---

## Phase F — Business Brain

**Status: 🟡 early foundation**

Goal: turn operational and financial records into useful decisions.

### Already present

- [x] Business Overview;
- [x] stock invested;
- [x] target/expected stock value;
- [x] projected gross;
- [x] realised profit groundwork;
- [x] ready-to-sell / needs-valuation / aged-stock indicators;
- [x] listings/offers summary;
- [x] direct Item cost breakdown;
- [x] separate Business Ledger summaries.

### Core questions still to mature

- [ ] actual cash position with clearly defined scope;
- [ ] stock at cost;
- [ ] capital tied up in stock;
- [ ] estimated sale value confidence coverage;
- [ ] expected vs realised profit;
- [ ] realised revenue;
- [ ] gross and net profit by period;
- [ ] monthly P&L;
- [ ] average margin;
- [ ] average ROI;
- [ ] average days to sale;
- [ ] most/least profitable Items;
- [ ] slow/dead stock scoring;
- [ ] incoming purchases/parts;
- [ ] sale-ready stock prioritisation;
- [ ] waiting Work/blockers;
- [ ] tool vs stock expenditure.

### Decision support

Target question:

> **What should I work on next?**

The answer may consider remaining effort, blockers, parts dependency, expected profit, value tied up, listing readiness, customer deadlines, age in queue and confidence of estimate.

Recommendations must show reasoning and remain advisory.

---

## Phase G — Listing and sales engine

**Status: 🟡 early foundation**

Goal: generate sale material from accepted facts only and preserve marketplace lifecycle.

Model:

`Item → Listings → Offers → Sale`

- [🟡] sale/listing record foundation exists;
- [ ] true multiple listings/channels per Item UX;
- [x] listed date / asking price / channel fields;
- [ ] external listing URL;
- [🟡] offer records exist; richer offer workflow remains;
- [ ] accepted/rejected/countered offer UX;
- [x] sale conversion foundation;
- [ ] channel-specific listing generation;
- [ ] image selection/order;
- [ ] publication checklist;
- [ ] sold/archive handoff and post-sale checklist.

Never invent water resistance, service state, originality or technical certainty.

---

## Phase H — Customer, public and Calibre Club layer

**Status: 💤 later; strategic direction now recorded**

Calibre remains the private source of truth. Customer/member access comes from an explicitly sanitised publication projection.

### Customer/public outputs

- [ ] customer-safe Passport;
- [ ] service/repair report;
- [ ] invoice/receipt;
- [ ] public catalogue;
- [ ] Wix/customer-site integration;
- [ ] QR provenance page;
- [ ] post-sale service history where appropriate;
- [ ] personal collection / owned-watch view where useful.

### Calibre Club

Club should feel like a real collector/ownership programme, not a generic points gimmick.

Possible eligibility:

- lifetime spend threshold;
- number of completed purchases;
- service/repair relationship;
- referrals;
- meaningful knowledge contribution;
- invitation / founding-member status.

**Membership status and contributor reputation must remain separate.**

Potential Club benefits:

- [ ] Club badge / status on account;
- [ ] early access to new stock;
- [ ] member-only watches or first-refusal windows;
- [ ] private offer/sale access;
- [ ] priority repair/service queue where commercially appropriate;
- [ ] selected shipping/service benefits;
- [ ] deeper provenance/technical publication views;
- [ ] member-only guides/reference material;
- [ ] collection registry / owned-watch Passport area;
- [ ] referral benefits;
- [ ] trade-in / consignment privileges;
- [ ] member anniversary or loyalty benefits.

### Published knowledge access

Members do **not** receive direct access to internal Supabase tables.

Target access levels could be:

`Public → Club Member → Contributor → Verified Contributor → Calibre Verified`

Examples:

- Public: basic history/reference information;
- Club Member: deeper technical/reference material;
- Contributor: may submit observations/evidence;
- Verified Contributor: established reputation and stronger review weighting;
- Calibre Verified: workshop-confirmed evidence inside Calibre's own verification model.

### Community evidence model

Potential submissions:

- serial/reference observations;
- movement markings;
- dimensions;
- dial/case variants;
- technical document references;
- compatibility observations;
- repair/fit evidence where appropriate.

All submissions must retain contributor, source/provenance, date and confidence. Community evidence never silently overwrites canonical Knowledge and never becomes **Calibre Verified** without the required verification path.

---

## Phase I — Tools, consumables and workshop registry

**Status: 🟡 foundation exists; UX incomplete**

- [x] tool registry schema;
- [🟡] purchase value/source foundation;
- [🟡] asset vs consumable distinction through separate tools/consumables models;
- [x] consumable stock and reorder-level fields;
- [🟡] storage location linkage exists;
- [ ] service/calibration dates where relevant;
- [x] Business Ledger can classify tools/equipment and consumables separately;
- [ ] automatic tool-purchase → ledger linkage where useful;
- [ ] low-stock/reorder workflow.

Tools remain business assets/expenses, not automatic watch costs.

---

## Phase J — Timegrapher v2

**Status: 💤 deferred until dedicated mic/hardware is validated**

Current/target capability:

- [x] sample-clock / AudioWorklet timing foundation;
- [x] BPH;
- [x] rate;
- [x] beat error;
- [🟡] stability;
- [🟡] persistent timing runs linked to Item/Work;
- [ ] richer positional workflow;
- [ ] formal before/after service comparison;
- [ ] hardware-specific calibration/validation.

**Amplitude remains disabled until lift-angle provenance and algorithm/microphone calibration are defensible.**

---

## Phase K — Printing and physical workflow

**Status: 🧪 explore after storage/QR and release candidate**

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

**Status: 🟡 early foundations**

One system adapted to context:

- phone: quick status, photos, measurements, parts, QR;
- DeX: research, finance, comparisons, dense admin;
- capture station: microscope/camera capture against a selected Item.

Current shell already treats phone and desktop/DeX differently; dedicated capture-station flows remain future work.

---

## Phase M — Global search / command layer

**Status: 🟡 active**

### Search now

- [x] Items;
- [x] Work;
- [x] Parts;
- [x] invoices;
- [ ] movement/calibre Knowledge;
- [ ] donors;
- [ ] locations;
- [ ] vendors/sources;
- [ ] business ledger transactions;
- [ ] listings/offers/sales;
- [ ] tools/consumables.

### Command actions

- [x] open Item;
- [x] create Item;
- [x] open Invoice intake;
- [x] add Part;
- [🟡] start Work handoff;
- [ ] move Work;
- [ ] add cost/ledger entry;
- [ ] mark part received;
- [ ] locate donor;
- [ ] start named Work template;
- [ ] open linked source document.

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

Learning should use confirmed bench evidence while preserving the difference between factory documentation, community observation, workshop confirmation and dimensional inference.

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

Database/media backup, export and a tested restore process are mandatory before main-domain cutover.

## Security

RLS on workspace-owned data; least privilege; no frontend secrets; signed private media; explicit publication boundary; no direct member access to internal operational tables.

## Financial integrity

- no profit without transactions;
- no cash position from valuations;
- no silent allocation changes;
- original currency preserved;
- material financial changes auditable;
- whole-business ledger and Item economics must not double-count the same cost.

## Offline/PWA

Not immediate. If added later, offline writes require a visible outbox and explicit conflict policy; Supabase remains authoritative.

## Phone / DeX acceptance

Every operational phase must be usable on phone and DeX/desktop before being accepted.

## Design language

Keep the accepted “Swiss technical instrument / old steel / workshop” direction. Do not let aesthetic churn interrupt workflow progress.

## Public/member publication boundary

Public and Club experiences consume a deliberate publication projection. Internal customer data, costs, private notes, supplier details and workshop-only records remain private.

---

# IMMEDIATE EXECUTION PLAN

This is the active order from this point forward.

### 1. Foundation hardening

- [ ] generate DB types;
- [ ] finish live-vs-repo migration audit;
- [ ] pagination/search foundation;
- [ ] error/audit hardening;
- [ ] backup/export plan;
- [ ] real restore drill design.

### 2. Acquisition completion

- [ ] proper Purchase / Lot model;
- [ ] incoming / received / discrepancy workflow;
- [ ] manual purchase entry;
- [ ] bundle splitting;
- [ ] manual shared-cost allocation override;
- [ ] Ready to Review / Completed Intake queue states.

### 3. Workshop acceptance and polish

- [ ] run one real watch end-to-end through the current Work/QC system;
- [ ] formal QC signer identity;
- [ ] Work timeline polish;
- [ ] printable/generated Job Card;
- [ ] customer-safe completion summary.

### 4. Parts / donors / storage

- [ ] donor suggestions;
- [ ] donor lineage/depletion;
- [ ] storage hierarchy;
- [ ] location history;
- [ ] phone-friendly moves.

### 5. Commerce / ledger hardening

- [ ] refunds / discounts / adjustments;
- [ ] reversal-based correction path;
- [ ] margin/reporting consistency;
- [ ] finance reconciliation tests;
- [ ] ledger integration from tools/purchases where useful.

### 6. Release Candidate / main URL

Only after Phases A–E core exit gates are satisfied.

- [ ] complete cross-device release sweep;
- [ ] complete backup/restore acceptance;
- [ ] freeze old `CalibreOI` as rollback;
- [ ] move `app.calibreco.com.au` to `Calibre-v2`;
- [ ] verify routing, auth, private media and Supabase writes on the custom domain.

### 7. Business Brain

- [ ] monthly/period reporting;
- [ ] stock/cash/profit reporting;
- [ ] profitability/ROI/days-held analytics;
- [ ] operational recommendations.

### 8. Listings, customer/public and Club

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
13. no legacy duplicate implementation remains active on the accepted route;
14. backup/recovery requirements are satisfied before business-critical cutover;
15. public/member access uses a sanitised publication boundary;
16. the roadmap is updated to reflect accepted reality.
