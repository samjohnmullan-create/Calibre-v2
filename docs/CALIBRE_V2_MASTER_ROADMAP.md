# Calibre & Co. v2 — Master Roadmap

**Status:** Canonical product and engineering roadmap  
**Last updated:** 12 October 2026  
**Repository:** `samjohnmullan-create/Calibre-v2`  
**Rule:** This document is the source of truth for what we build, why we build it, what is deliberately deferred, and what must be tested before moving on.

---

## 1. Product statement

> **Calibre is the operating system for the workshop, inventory, research and resale business.**

The physical object is the centre of the system.

**Lifecycle:**

`Acquisition → Identification → Research → Work → Parts → Timing → QC → Valuation → Listing → Sale → Permanent history`

Calibre must make this lifecycle easier without turning the workshop into data entry.

---

## 2. Source review used for this roadmap

This roadmap consolidates the design decisions and requirements from:

- prior Calibre conversations and accepted/rejected feature ideas through 12 October 2026;
- the clean v2 schema lock and current live Supabase project;
- the current `Calibre-v2` GitHub codebase;
- the original/legacy Calibre app and its service-stage workflow;
- `calibre_knowledge_engine_v25.json` and its movement, parts, compatibility, identification and source-provenance rules;
- the uploaded watchmaking reference material, including *Tools & Materials of the Trade*, Donald de Carle's *Watch & Clock Encyclopedia*, the watch/clock repair handbook, and Joseph Bulova School material;
- the real workshop workflow: Samsung Galaxy phone, DeX/monitor use, Galaxy Tab/microscope capture, physical timegrapher/OTG equipment, bench tools, donors, parts and resale stock.

### Main lessons from those sources

1. **The Item/Work split is correct.** A physical Item persists; Work is activity performed on it.
2. **The old service stages contain useful watchmaking knowledge, but must not become the app's navigation.** They should return later as optional service templates/checklists inside Work.
3. **Research must preserve evidence and uncertainty.** Findings should be accepted/rejected/superseded rather than silently overwritten.
4. **Compatibility must be evidence-ranked.** Same family or similar dimensions are leads, not proof.
5. **The knowledge dataset is a major asset.** It should become structured reference data, not remain a giant JSON blob wired directly into UI logic.
6. **Calibre must work differently on a phone and on DeX/desktop.** Responsive design is a workflow requirement, not just styling.
7. **The internal app and public storefront are different products.** Calibre remains private source of truth; Wix/public pages consume a safe projection later.
8. **Actual money available matters more than hypothetical auction exposure.** Finance must distinguish cash, inventory value and potential profit.
9. **Measurements and timing must be defensible.** Unknown lift angles or weak timing signals must never be converted into fake precision.
10. **The app must accumulate knowledge from real bench evidence over time.** It should become smarter because of confirmed repairs, measurements, donor fits and outcomes.

---

## 3. Architectural laws — do not break these

These are not preferences. Any future feature must fit these rules or the roadmap must be consciously amended first.

1. **Item is the physical-object root.**
2. **Work is optional and separate.** One Item can have many Work records.
3. **Supabase is authoritative.** Browser state may cache or queue; it is never the master record.
4. **No resurrection of `jobs`, `currentId`, or a giant mutable state object.**
5. **URLs/deep links identify the thing being viewed.** Target routes include `/items/:id`, `/work/:id`, and `/items/:id/passport`.
6. **Media is uploaded once and linked/reused by context.**
7. **Research produces structured findings with sources and confidence.**
8. **Accepted identity and evidence history are distinct.** Wrong hypotheses are rejected/superseded, not erased.
9. **Reference knowledge and bench evidence are distinct.** Published interchangeability and a fit observed on the bench are not the same claim.
10. **Costs are transactions, valuations are snapshots, sales are lifecycle records.** No single mutable “business blob”.
11. **Audit/history is append-only where practical.**
12. **Private internal rows are never exposed directly to customers.** Public Passport/storefront data comes from a sanitised projection.
13. **Generic Item core; specialist modules when appropriate.** Watches, clocks, jewellery, accessories and other small resale stock can all exist as Items, while watch-only features remain optional.
14. **AI may propose; it does not silently rewrite accepted facts.**
15. **No precision we cannot defend.** Applies especially to movement identity, parts compatibility, water resistance and timegrapher amplitude.

---

## 4. Anti-legacy rules

This section exists specifically because the original Calibre grew too many overlapping systems.

### 4.1 One canonical implementation

Do not create `FeatureV2`, `FeatureV3`, `NewFeatureFinal`, duplicate stores, duplicate schemas or parallel screens as a normal development method.

When replacing a feature:

1. build behind a small isolated component or branch;
2. test it;
3. switch to it;
4. remove the obsolete implementation in the same phase.

### 4.2 One owner for each fact

Every important value must have an obvious canonical owner. Examples:

- physical object → `items`
- current accepted identity → `item_identity`
- evidence/history → `item_facts` + sources
- technical dossier → `passports`
- activity → `work_records` / `work_events`
- media → `media_assets`
- measurements → `measurements`
- timing → `timing_runs`
- costs → `cost_entries`
- value snapshots → `valuations`
- parts → `parts`
- storage → `storage_locations`

If two screens appear to own the same value, stop and resolve the model before adding more UI.

### 4.3 Schema changes are migrations

No important production schema change should exist only as a manual Supabase dashboard change. Migrations must be committed to the repository before the corresponding feature is considered complete.

### 4.4 No feature is complete without persistence testing

For data-changing features, the acceptance test must include:

`change → save → refresh → confirm persisted value`

Where relevant, also test:

`sign out/in → confirm persisted value`

### 4.5 Phone and DeX are separate acceptance targets

Every substantial UI phase is tested on:

- Galaxy phone;
- DeX/desktop monitor;
- mouse/keyboard behaviour where relevant.

### 4.6 Delete dead code

Old components, CSS patches and abandoned implementations are removed after replacement. Git already preserves history; the production source tree does not need to.

### 4.7 Keep the roadmap current

At the end of each accepted phase:

- update status in this document;
- add any schema/architecture decision made;
- record significant deferred work;
- update the changelog at the bottom.

---

## 5. Current state — 12 October 2026

### Backend

- ✅ Clean separate Supabase v2 project in Sydney.
- ✅ Workspace/membership model and RLS.
- ✅ Item, Work, identity, Passport, research, media, parts, measurements, timing, commerce, tools/consumables and knowledge tables exist.
- ✅ Private `calibre-media` storage bucket with workspace-aware policies.
- ✅ Oris Item #1 and Work #1 exist as real production test records.
- ⚠️ Production schema migrations are not yet represented cleanly in the GitHub repo.
- ⚠️ Some later domain areas will need targeted schema refinement before UI is built around them: timeline/events, listings, commerce parties/items, parts normalisation and cash ledger.

### Frontend

- ✅ Auth using 8-digit email OTP.
- ✅ Live Supabase session/workspace bootstrap.
- ✅ Responsive shell with separate phone behaviour and DeX/desktop behaviour.
- ✅ Items list and Item workspace.
- ✅ Workbench trays with status movement, priority, next action and waiting/blocker data.
- ✅ Item editing with persistence.
- 🟡 Photos/Media feature built and awaiting final user acceptance test.
- ⬜ Passport UI.
- ⬜ Research workspace.
- ⬜ Knowledge Engine integration.
- ⬜ Movement Finder.
- ⬜ Parts/donor UI.
- ⬜ Commerce/business intelligence.
- ⬜ Timegrapher v2.

### Early legacy warning found during this review

The source tree currently contains `App.tsx`, `AppV2.tsx`, `AppV3.tsx`, `AppV4.tsx` and multiple narrow CSS patch files.

This is **not a failure**, but it is the first pattern we explicitly do not want to continue. The next major phase therefore begins with a stabilisation/refactor gate before more feature surface is added.

---

# ROADMAP

Status legend:

- ✅ Complete / accepted
- 🟡 In progress / awaiting acceptance
- ⬜ Planned
- 🔒 Mandatory gate before proceeding
- 🧪 Explore / prove before committing
- 💤 Deliberately deferred

---

## Phase 0 — Clean foundation

**Status:** ✅ substantially complete

### Goal

Start from a clean Supabase-backed Item/Work model without legacy state assumptions.

### Already achieved

- clean Supabase project;
- RLS/workspaces;
- real Oris Item and Work acceptance data;
- GitHub Pages deployment and CI build;
- auth repaired and converted to numeric OTP;
- responsive phone/DeX shell.

### Still required for full closure

- [ ] Commit current Supabase migrations into `supabase/migrations/`.
- [ ] Generate and commit Supabase TypeScript database types.
- [ ] Update README; remove stale magic-link instructions.
- [ ] Document environment/deployment process.

---

## Phase 0.5 — Stop-the-rot stabilisation gate

**Status:** 🔒 NEXT after Media acceptance

### Why this exists

We are now adding real features quickly. This is exactly when architecture either stays clean or begins accumulating parallel versions and patches.

### Work

#### Frontend consolidation

- [ ] Make one canonical `App.tsx` entry implementation.
- [ ] Remove obsolete `AppV2.tsx`, `AppV3.tsx`, `AppV4.tsx` after parity is verified.
- [ ] Split the monolith into route/page components and feature components.
- [ ] Establish folders such as `features/items`, `features/work`, `features/media`, `features/auth`, `components`, `lib`.
- [ ] Consolidate CSS into design tokens + shell/layout + feature styles; remove accumulated “fix” files where practical.

#### Routing

- [ ] Add explicit deep-link routing for Item and Work.
- [ ] Refreshing an Item must reopen that Item.
- [ ] Workbench → Item and future research/passport links must be URL-addressable.
- [ ] Route handling must work on GitHub Pages.

#### Data access

- [ ] Pull raw Supabase calls out of giant UI components into focused repositories/hooks/services.
- [ ] Use generated DB types rather than manually duplicated table shapes where practical.
- [ ] Centralise common error/loading behaviour.

#### Testing

- [ ] CI: typecheck + production build.
- [ ] Add unit tests for important pure business logic.
- [ ] Add browser/e2e smoke tests for auth-session restoration, Items, Workbench, Item edit and Media.
- [ ] Add at least one persistence test against a safe test record/environment strategy.
- [ ] Add RLS/security acceptance tests as the backend grows.

#### System health

- [ ] Add a small internal system-health view under Calibre: auth, DB, storage, schema/app version, current workspace, basic write/read checks.
- [ ] Never expose secrets/service-role keys in the frontend.

### Exit criteria

- One canonical app implementation.
- Old version files removed.
- Deep linking works.
- CI catches basic regressions.
- README and roadmap reflect reality.
- Phone and DeX regression test passes.

**Do not begin major Passport/Research feature expansion until this gate passes.**

---

## Phase 1 — Core Item workspace

**Status:** 🟡 mostly complete

### Goal

Make Item a genuinely useful permanent record rather than a container around Work.

### Current

- ✅ Item list and selection.
- ✅ Work / Item / Commerce conceptual tabs.
- ✅ Identity display.
- ✅ Item editing.
- ✅ Current cost/valuation summary.

### Finish

- [ ] Deep-link routes.
- [ ] Better empty states and create-item flow.
- [ ] Search/filter Items.
- [ ] Archive rather than casually delete Items.
- [ ] Item history/timeline surface.
- [ ] Physical location summary.
- [ ] Primary image in Item list/header once Media is accepted.

### Important design rule

Item status is ownership/disposition workflow, not repair status. Work status belongs to Work.

---

## Phase 2 — Media and Capture

**Status:** 🟡 built; acceptance pending

### Goal

One durable media library per Item that serves research, Work, Passport and sale outputs.

### Core

- [x] Private Supabase storage.
- [x] `media_assets` metadata.
- [x] Categories.
- [x] primary/cover image UI.
- [x] phone upload.
- [x] signed private previews.
- [ ] Complete user acceptance test: upload → primary → refresh → remove → refresh.

### Hardening immediately after acceptance

- [ ] Separate **Take photo** and **Choose photos** actions on mobile if browser behaviour warrants it.
- [ ] Resize/compress large phone images before upload or produce thumbnails so galleries do not pull multi-megabyte originals.
- [ ] Capture width/height and, where useful, taken-at metadata.
- [ ] Enforce/guarantee only one primary image per Item.
- [ ] Align storage path convention with the canonical schema convention.
- [ ] Handle orphaned storage/database records safely.
- [ ] Reuse media by role/context rather than duplicate upload.

### Later Capture Station

- [ ] Galaxy Tab/microscope workflow.
- [ ] Scan/select Item and capture directly into it.
- [ ] Quick category buttons: dial, movement, caseback, serial, damage, measurement, work progress, finished, sales.
- [ ] Batch capture with minimal typing.

---

## Phase 3 — Passport and permanent technical dossier

**Status:** ⬜

### Goal

Create the technical record that persists with the Item across multiple Work records.

### Passport fields

- maker / model / reference / serial;
- confirmed or proposed calibre;
- jewel count;
- winding/movement type;
- dimensions;
- case/material details;
- dial/case/movement markings;
- escapement where known;
- beat rate;
- lift angle only when sourced/verified;
- power reserve where known/measured;
- reference numbers and aliases;
- research notes and accepted findings;
- linked media;
- service history summary;
- timing/measurement summaries.

### Rules

- Passport is not a duplicate of Item identity.
- Autofill from knowledge data is visibly sourced.
- Unknown values stay unknown.
- A proposed calibre never silently becomes confirmed.

### Outputs

- internal Passport workspace;
- printable/exportable text-led Watch Passport;
- future safe public Passport projection.

---

## Phase 4 — Research workspace and evidence model

**Status:** ⬜

### Goal

Turn “research this watch” into a structured, reviewable process.

### Workflow

`Research request → sources → findings → confidence → accept/reject/supersede → promote accepted facts`

### Features

- [ ] Create research request from an Item.
- [ ] Stable research request reference.
- [ ] Source list with title, provider, URL/document reference, date accessed and source type.
- [ ] Findings with field/topic, value, confidence, rationale and evidence links.
- [ ] Accept/reject/supersede workflow.
- [ ] Explicit “Apply to Item/Passport” action.
- [ ] Contradictions stay visible.
- [ ] Research status and missing-information prompts.

### Research source classes

Prefer and label sources by type, for example:

- original manufacturer/factory material;
- technical parts sheets;
- recognised movement/reference databases;
- historical books/manuals;
- reputable secondary sources;
- marketplace/sold comps for valuation only;
- user/bench observation.

### ChatGPT workflow

The app should eventually be able to create a secure research request that can be processed by ChatGPT and returned as structured findings. The app must not depend on copying a whole job blob back and forth.

---

## Phase 5 — Knowledge Engine ingestion

**Status:** ⬜, high value

### Goal

Turn the existing large knowledge dataset into a queryable, versioned reference system.

The current knowledge material already contains valuable concepts including:

- movement specifications;
- movement families;
- part references;
- calibre-to-part applications;
- compatibility edges;
- identification signals;
- technical documents;
- source provenance;
- application/serial-range exceptions;
- known owned-watch research profiles.

### Mandatory ingestion principles

- [ ] Do **not** wire the giant JSON directly into application state.
- [ ] Build an import/ETL path into normalised `knowledge_*` tables.
- [ ] Retain source IDs/provenance and dataset version/checksum.
- [ ] Imports are repeatable/idempotent.
- [ ] Conflicting sources can coexist.
- [ ] Trusted reference data is read-only to normal clients.

### Compatibility hierarchy

When assessing a part/donor, rank evidence roughly as:

1. exact documented factory/shared part number;
2. documented application/interchange statement;
3. serial/grade-specific application where applicable;
4. confirmed calibre-family relationship;
5. matching measurements/architecture as a candidate only;
6. visual similarity as a weak lead only.

**Never:** “same family = guaranteed fit”.

---

## Phase 6 — Movement Finder

**Status:** ⬜

### Goal

Help identify unknown movements without pretending certainty.

### Inputs

- visible maker/calibre markings;
- movement diameter/height;
- jewel count;
- manual/automatic;
- seconds position/layout;
- date/day/complications;
- bridge/cock architecture;
- setting/winding characteristics;
- beat rate where measured;
- photos and selected visual signals.

### Output

Ranked candidates with:

- score/confidence;
- evidence that matched;
- evidence that conflicts;
- source links;
- next measurement/photo that would best separate the candidates.

### Rule

A candidate becomes accepted identity only through explicit confirmation.

---

## Phase 7 — Workbench v2: from trays to workshop intelligence

**Status:** 🟡 core workflow exists

### Current

- ✅ Queue / Ready / On bench / Waiting / QC / Complete.
- ✅ priority.
- ✅ next action.
- ✅ waiting reason/blocker.
- ✅ phone and DeX interaction.

### Next depth

- [ ] dedicated Work route/view;
- [ ] diagnosis notes and fault list;
- [ ] Work events/timeline;
- [ ] linked measurements;
- [ ] linked timing runs;
- [ ] parts required/used;
- [ ] Work photos/media roles;
- [ ] QC record;
- [ ] completion summary;
- [ ] generated Job Card view/output.

### Service templates — bring back the useful part of the old app

The legacy app used a fixed sequence:

`Intake → Demagnetising → Strip-down → Inspection → Cleaning → Barrel & Mainspring → Train Test → Escapement → Balance → Lubrication → Regulation → Final QC`

These remain useful as **optional service checklist templates**, not Workbench columns and not mandatory navigation.

Each checklist task may carry:

- complete/not applicable;
- notes;
- condition;
- measurement;
- linked parts;
- linked photos;
- timestamp.

Different Work types can have different templates: inspection, full service, repair, crystal replacement, cleaning, listing prep, QC.

---

## Phase 8 — Measurements and QC

**Status:** ⬜

### Goal

Capture defensible workshop facts once and reuse them everywhere.

### Measurements

Examples:

- case diameter/thickness;
- lug width;
- movement diameter/height;
- stem/crown measurements;
- pivot/staff dimensions;
- crystal dimensions;
- mainspring dimensions;
- power reserve;
- other typed measurements.

Record:

- value/unit;
- method/tool where useful;
- date;
- Work context;
- notes/confidence.

### QC

A configurable QC checklist should cover relevant checks such as:

- winding;
- setting;
- hand clearance;
- calendar change where present;
- running stability;
- timing positions;
- power reserve where measured;
- case/crystal/strap condition;
- final visual clean;
- water-resistance claim only when actually pressure tested.

---

## Phase 9 — Parts, donors and physical storage

**Status:** ⬜

### Goal

Know what parts exist, where they are, what they came from and what they may fit.

### Parts inventory

- loose parts;
- donor movements;
- donor watches/Items;
- new purchased parts;
- salvaged parts;
- consumables where useful.

For each part:

- normalised part type/reference;
- source/provenance;
- donor Item where applicable;
- condition;
- quantity;
- dimensions where useful;
- storage location;
- cost;
- compatibility evidence.

### Donor intelligence

- confirmed / strong / probable / possible / incompatible;
- exact reason/evidence;
- bench fit result;
- donor completeness/value;
- cost of external replacement part;
- warning before sacrificing a valuable/complete donor.

When compatibility is equal, owned donor stock may rank above an external purchase, but only after economics are considered.

### Physical storage

Hierarchical locations:

`Workshop → cabinet → drawer/tray → bin/slot`

Use QR labels for:

- Items;
- donor movements;
- loose-parts containers;
- trays/bins;
- optionally tools.

Scanning should open the record or allow a quick location move.

---

## Phase 10 — Timegrapher v2

**Status:** 💤 deferred until the dedicated mic/timegrapher hardware is in hand and tested

### Goal

Produce trustworthy timing records that attach to Item/Work and help regulation/QC.

### Required

- USB/OTG microphone input;
- AudioWorklet/sample-clock timing rather than redraw timing;
- automatic/manual BPH;
- rate;
- beat error;
- signal quality/confidence;
- 30/60/120 second sessions;
- position selection and multi-position run sets;
- saved raw/summary timing result;
- before/after service comparison;
- graph/stability view.

### Amplitude rule

Do not show a confident amplitude simply because an algorithm can output a number.

Amplitude may be enabled only after:

- lift angle is verified or manually selected with clear provenance;
- microphone geometry/algorithm is validated against a trusted reference device across representative watches;
- unreliable results are clearly suppressed.

Until then, rate + beat error + stability are more valuable than fake amplitude.

### Knowledge integration

Confirmed calibre may preload expected BPH and known lift angle. Missing lift angle remains missing.

---

## Phase 11 — Acquisition and purchase intake

**Status:** ⬜

### Goal

Turn purchases and auction opportunities into Items without retyping everything.

### Intake

- source/vendor/auction house;
- lot/order reference;
- purchase price;
- buyer premium;
- postage;
- tax/fees where relevant;
- purchase date;
- incoming/received status;
- photos/listing snapshot where legally/technically appropriate;
- create one or multiple Items from a lot.

### Email intake

Later automation can identify relevant purchase/parts emails from connected Gmail/Outlook and offer to create/update incoming records.

Automation must be reviewable rather than silently creating incorrect inventory.

### Auction triage

For Australian auctions, evaluate:

- likely Item identity;
- condition/repair upside;
- parts/donor usefulness against owned stock;
- conservative resale range;
- fees/postage;
- maximum sensible bid.

### Finance constraint

Do not turn hypothetical bids into “money spent” or reduce available cash until a purchase actually occurs.

---

## Phase 12 — Commerce and valuation

**Status:** 🟡 basic summary exists; full model planned

### Goal

Know the economics of every Item and the business as a whole.

### Per Item

- purchase cost;
- premium/postage;
- part costs;
- consumables if deliberately allocated;
- external service;
- marketplace fees;
- customer postage;
- preparation cost;
- historical valuations;
- target and minimum sale price;
- realised sale;
- profit;
- ROI;
- value uplift after work;
- eventually profit/hour.

### Important separation

Tool purchases are business/tool costs, not automatically attributed to an individual watch. Tools and consumables already have their own conceptual inventory.

### Valuation quality

Where market research is used, store enough context to distinguish:

- sold price vs asking price;
- condition;
- date;
- currency;
- source;
- serviced vs unserviced;
- confidence.

---

## Phase 13 — Business Brain

**Status:** ⬜

### Goal

Answer the questions that actually help run the workshop/business.

### Dashboard

- actual available cash;
- capital tied up in inventory;
- capital tied up by status/age;
- expected vs realised profit;
- sold profit by month/source/category;
- most profitable Items;
- slow-moving stock;
- tools vs stock costs;
- incoming purchases/parts;
- sale-ready stock;
- waiting Work and blockers.

### “What should I work on next?”

Rank or explain using:

- sale readiness;
- expected profit/value uplift;
- estimated work remaining;
- blocker status;
- age/capital tied up;
- parts availability;
- confidence/unknowns;
- user-set priority.

This remains advice, not an opaque score that overrides workshop judgement.

### Cash model

Before building “available cash”, introduce a proper cash/business ledger or equivalent model that can represent opening balance and non-Item business transactions. Do not fake cash using inventory valuation.

---

## Phase 14 — Listing engine

**Status:** ⬜

### Goal

Generate accurate sale material from accepted Calibre data instead of rewriting each listing manually.

### Outputs

- eBay title/description;
- Facebook Marketplace copy;
- Calibre website copy;
- short social copy;
- technical specifications;
- condition statement;
- service/restoration summary;
- photo checklist;
- pricing suggestions from stored valuation.

### Rules

- use accepted facts only;
- unknowns stay qualified;
- never invent water resistance;
- distinguish serviced, inspected and merely running;
- avoid copying private internal notes into customer text;
- retain a record of the listing version used.

### Schema gate

Before implementation, review whether a first-class `listings` model and channel-specific listing records are needed rather than overloading `sales`.

---

## Phase 15 — Public catalogue, Wix and customer Passport

**Status:** 💤 later, deliberately separate from internal app

### Direction already chosen

- Calibre remains the private source of truth.
- Wix is a strong candidate for the customer-facing catalogue/store, checkout and SEO.
- Public pages receive only explicitly published data.

### Visibility

Useful publication states to explore:

`Private → Catalogue → For sale → Sold/archive`

### Public experience

- simple elegant catalogue, not internal app UI;
- search/browse;
- strong photos;
- condition and factual workshop documentation;
- enquiry/buy path;
- sold archive;
- individual customer-safe Passport page.

### QR

Support both:

- permanent full-catalogue QR for cards, packaging, markets, Facebook/social and printed material;
- Item-specific QR that opens that Item's public Passport/listing when published.

---

## Phase 16 — Tools, consumables and workshop registry

**Status:** ⬜

### Goal

Keep track of what the workshop owns without mixing capital equipment into watch stock.

### Tools

- name/type/brand/model;
- purchase date/cost;
- location;
- notes;
- maintenance/calibration where relevant;
- compatible accessories;
- status.

### Consumables

- oils/greases;
- cleaning fluids;
- Rodico/pegwood;
- gloves/finger cots;
- crystals/straps and similar stock where appropriate;
- quantity/reorder level;
- storage.

### Smart use

Workbench can later say:

- required tool is owned/not owned;
- required part/consumable is in stock;
- where it is stored.

---

## Phase 17 — Printing and physical workflow

**Status:** 🧪 explore

### Need

The workshop uses Samsung mobile/DeX, but some label printers are not Android/browser friendly.

### Preferred direction

Do not build printer-specific Android drivers into Calibre.

Explore a **Print Queue / Print Bridge**:

1. Calibre generates a label/QR job;
2. the job is queued centrally;
3. a compatible desktop/mini-PC/browser print bridge prints it to DYMO/other hardware.

Also keep normal PDF/browser printing available for passports, job cards and larger labels.

### Label uses

- Item ID + QR;
- tray/bin/location;
- donor movement;
- parts container;
- sold/packing slip where useful.

---

## Phase 18 — Smart Capture and device modes

**Status:** 🧪 explore after core workflows are stable

Do not add separate product complexity merely because multiple devices exist. Adapt the same system to context.

### Phone / bench mode

- quick Work status;
- next action;
- photo capture;
- measurements;
- parts used;
- QR scan;
- minimal typing.

### DeX / workstation mode

- dense Item/Workbench layouts;
- research side-by-side;
- finance/listing work;
- multi-column comparisons;
- keyboard/mouse efficiency.

### Capture Station / Galaxy Tab + microscope

- choose/scan Item;
- microscope/camera capture;
- quick category and caption;
- push image into the shared Item media library.

Existing nExt Camera can remain the microscope camera tool; Calibre does not need to replace working specialist software unless integration later provides clear benefit.

---

## Phase 19 — Global search and command layer

**Status:** 🧪 later

### Goal

When the database becomes large, make everything reachable without navigation hunting.

Search across:

- Item number/title/maker/model/serial/reference;
- calibre;
- Work and blocker;
- part reference;
- donor;
- storage location;
- source/document;
- listing/sale.

Potential command actions:

- open Item;
- start Work;
- capture photo;
- move location;
- add cost;
- run research;
- print label.

Keep it optional; the main UI still has to work without memorising commands.

---

## Phase 20 — Automation and inbox

**Status:** 💤 after the underlying manual workflows are proven

### Candidates

- purchase email → suggested intake;
- shipment/part arrival → incoming update;
- waiting-for-parts reminders;
- stale Work reminders;
- auction opportunity ingest;
- sold/fee reconciliation;
- listing publish/update;
- public Passport publish;
- scheduled business summary.

### Rule

Automate a workflow only after the manual version is stable and understood. Otherwise automation merely hides bad data faster.

---

## Phase 21 — Learning loop / accumulated workshop intelligence

**Status:** 💤 long-term differentiator

### Goal

Make Calibre smarter because the workshop has used it.

Learn from confirmed evidence such as:

- part actually fitted / did not fit;
- measured movement dimensions;
- confirmed calibre identification;
- recurring fault;
- service action and result;
- pre/post timing change;
- repair time/cost;
- achieved sale price;
- donor usefulness.

### Important separation

A private bench observation can improve recommendations without automatically being promoted to universal reference truth.

The system should know the difference between:

- “factory documentation says this fits”;
- “our bench has confirmed this fit twice”;
- “dimensions suggest it might fit”.

---

# CROSS-CUTTING WORK

## A. Timeline and history

The schema has audit and Work events, but the user-facing permanent history still needs a deliberate model.

Explore a clear Item timeline combining meaningful events such as:

- acquired;
- identified/research finding accepted;
- Work opened;
- inspection/repair milestone;
- part used;
- media milestone;
- timing/QC result;
- valuation;
- listed;
- sold.

Do not confuse this with low-level audit logging.

A dedicated `timeline_events` projection/table may be useful if `work_events` and audit are too technical for the user-facing history.

---

## B. Backups, portability and recovery

This was an important weakness/risk in the legacy direction and must not be ignored.

- [ ] Confirm Supabase database backup policy appropriate to the plan.
- [ ] Define media backup/export strategy.
- [ ] Provide Item/Work/Passport export in human-readable formats.
- [ ] Provide full workspace export later.
- [ ] Perform an actual restore/recovery drill before calling the system business-critical.
- [ ] Avoid undocumented data that exists only in browser local storage.

---

## C. Security and privacy

- RLS on all workspace-owned data;
- least privilege;
- no secrets in repository/frontend;
- explicit publish boundary for customer data;
- signed/private media internally;
- public pages use separate safe records/projections;
- maintain owner/editor/viewer behaviour;
- periodically rerun security advisor/RLS tests.

---

## D. Performance

Do not optimise blindly, but plan for:

- thumbnail rather than full-resolution gallery loads;
- pagination/search when Items/media grow;
- indexed serial/reference/calibre/part searches;
- avoiding N+1 Supabase requests;
- cache where useful without creating a second source of truth.

`pg_trgm` / full-text search may be useful later for fuzzy maker/model/serial/reference search.

---

## E. Offline/PWA

**Not immediate.** A service worker/local cache too early risks recreating the browser-owned-state problem.

Later, if workshop connectivity makes offline useful:

- read cache is safe;
- offline writes use an explicit outbox/queue;
- every queued write has visible sync state;
- conflict policy is defined;
- Supabase remains authoritative.

Native Android is not required while responsive web/PWA covers the workflow well.

---

## F. Design language

Keep Calibre visually workshop/luxury rather than wellness/spa.

Direction:

- charcoal / warm dark foundation;
- warm ivory text;
- restrained brass/gold accent;
- optional restrained burgundy rather than sage;
- dense but calm DeX layouts;
- clean one-column phone layouts;
- text-led formal customer documents rather than decorative certificate imagery.

Do not let visual rework interrupt core workflow phases unless usability is affected.

---

# SCHEMA REVIEW GATES

Do not perform a broad rewrite now. Instead review the model immediately before these feature blocks:

### Before Parts/Donor UI

Review:

- part identity vs individual stock unit;
- quantities;
- provenance;
- donor salvage;
- reference applications;
- bench fit evidence;
- storage.

### Before Listings/Sales expansion

Review need for:

- parties/vendors/customers;
- purchase lots/items;
- listings/channel records;
- sale items;
- fees/refunds/returns;
- currency stored in minor units where appropriate.

### Before Business Cash dashboard

Introduce a proper cash/business ledger model rather than deriving cash from valuations.

### Before service templates

Decide whether `work_tasks`, checklist template tables or a compact JSON template + relational results model best fits the workflow. Avoid turning `work_records` into another giant blob.

### Before public Passport

Design a separate publication/projection model rather than granting public access to internal Item tables.

---

# DEFINITION OF DONE FOR EVERY PHASE

A phase is not “done” because the screen renders.

Unless not applicable, completion means:

1. data model is clear and canonical;
2. migrations are committed;
3. feature works against real Supabase records;
4. save + refresh persistence test passes;
5. phone test passes;
6. DeX/desktop test passes;
7. error/empty/loading states exist;
8. RLS/security behaviour is correct;
9. obsolete implementation is removed;
10. build/tests pass;
11. this roadmap is updated;
12. user accepts the test checklist.

---

# IMMEDIATE EXECUTION ORDER

This is the working order from today.

1. **Finish Photos/Media acceptance test.**
2. **Phase 0.5 stabilisation gate.** Consolidate App versions, routes, CSS, migrations, DB types and testing.
3. **Passport.**
4. **Research/evidence workspace.**
5. **Knowledge Engine ingestion.**
6. **Movement Finder.**
7. **Parts/donor + storage/QR.**
8. **Deep Work/Work events/service templates/measurements/QC.**
9. **Commerce/valuation + acquisition intake.**
10. **Business Brain.**
11. **Listing engine.**
12. **Timegrapher once hardware is ready/validated.**
13. **Printing/device workflows.**
14. **Wix/public catalogue + public Passport.**
15. **Automation and learning loop.**

The exact order may move when real workshop pain exposes a better dependency, but changes should be made here deliberately rather than by adding random features.

---

# EXPLORATION BACKLOG — WORTH TESTING, NOT YET COMMITTED

These are promising ideas that should be prototyped only when their dependency is ready.

- 🧪 **Photo-assisted Movement Finder** using selected image/measurement signals, with human confirmation.
- 🧪 **“What measurement next?” identification assistant** that chooses the observation with highest information value.
- 🧪 **Donor sacrifice economics**: compare owned donor value/completeness against external replacement cost.
- 🧪 **Bench confidence score** based on repeat confirmed fits rather than generic AI confidence.
- 🧪 **Repair time tracking** using light-touch start/stop or event timestamps, only if it does not become tedious.
- 🧪 **Profit per bench hour** once time data is reliable.
- 🧪 **Before/after service evidence card** combining timing, photos, measurements and work summary.
- 🧪 **QR-driven tray workflow**: scan tray then scan Item/part to move it physically.
- 🧪 **Print Bridge** for DYMO/desktop-only printers.
- 🧪 **Automatic listing photo readiness**: detect whether dial/caseback/movement/side/profile/finished shots are present.
- 🧪 **Data-quality prompts**: “calibre unconfirmed”, “no movement photo”, “target price has no valuation basis”, “Work complete but QC missing”.
- 🧪 **Research diff**: show exactly which accepted facts a new research finding would change before applying it.
- 🧪 **Source reliability profiles** by source type, without hiding disagreement.
- 🧪 **Market-comps snapshots** with date/currency/condition and sold-vs-asking separation.
- 🧪 **Public provenance/service summary** generated from sanitised internal evidence.
- 🧪 **Workbench focus mode** for the watch currently physically on the bench.
- 🧪 **Global command/search palette** once record counts justify it.

---

# DELIBERATELY NOT NOW

These are parked to prevent scope creep or premature complexity.

- 💤 Native Android rewrite.
- 💤 Replacing nExt Camera when it already handles the microscope.
- 💤 Customer CRM before the resale/workshop core is stable.
- 💤 Heavy AI agents that autonomously modify business records.
- 💤 Unvalidated timegrapher amplitude.
- 💤 Direct Android DYMO driver development.
- 💤 Public exposure of internal Supabase Item rows.
- 💤 Giant framework rewrite simply for fashion/architecture preference.
- 💤 Offline write system before core data flows stabilise.
- 💤 A separate Donor object type — donor remains an Item purpose/relationship.
- 💤 Reintroducing a separate Job Card database — Job Card remains a generated view/output of Item + Work + evidence.

---

# REAL ORIS ACCEPTANCE LIFECYCLE

The round black-dial Oris remains the end-to-end acceptance object for v2.

Target journey:

- [x] Create Item.
- [x] Identity seed.
- [x] Purchase cost.
- [x] Valuation/target/minimum.
- [x] Create Work in Queue.
- [x] Workbench status/priority/next-action persistence.
- [x] Item editing persistence.
- [ ] Upload and persist media.
- [ ] Research request/findings.
- [ ] Passport.
- [ ] Open Work and record inspection.
- [ ] Identify movement/calibre without guessing.
- [ ] Record measurements.
- [ ] Record parts if required.
- [ ] Timing run if appropriate.
- [ ] QC.
- [ ] Work complete.
- [ ] Generate listing.
- [ ] List.
- [ ] Sale record.
- [ ] Mark Item Sold.
- [ ] Confirm permanent history and customer-safe Passport output.

Specific acceptance rule: **never assign Oris calibre 715 to this round watch without actual evidence.**

---

# DECISIONS ALREADY LOCKED

- Top-level internal navigation: **Home · Items · Workbench · Business · Calibre**.
- Item workspace conceptual areas: **Work · Item · Commerce**.
- Supabase is the private source of truth.
- Public/customer site is separate from the internal app.
- Wix is worth using/exploring for the public storefront rather than rebuilding ecommerce inside Calibre.
- Mobile phone and DeX/desktop both matter.
- Donor is an Item purpose, not a separate entity type.
- Job Card is generated from canonical records, not its own source of truth.
- Actual cash is distinct from stock value/potential profit.
- Compatibility is evidence-ranked, never assumed from family name alone.
- Timegrapher amplitude is deferred until validated.
- Customer documents should remain clean, formal and text-led.

---

# CHANGELOG

## 2026-10-12 — Master roadmap created

- Consolidated prior Calibre roadmap discussions and rejected/accepted ideas.
- Reconciled with v2 schema lock, live backend, current GitHub app and existing knowledge dataset.
- Added mandatory Phase 0.5 anti-legacy stabilisation gate after Media acceptance.
- Restored the valuable legacy service stages as future optional service templates rather than application navigation.
- Added explicit knowledge-engine ingestion, evidence hierarchy, schema review gates, testing/Definition of Done, device modes, printing, backups and learning-loop requirements.
- Recorded current implementation status and Oris lifecycle acceptance path.
