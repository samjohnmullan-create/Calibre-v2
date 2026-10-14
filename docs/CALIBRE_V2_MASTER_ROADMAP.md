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

**Future intelligence lifecycle**

`Evidence → Context → Recommendation → Human approval → Calibre action → Audit history → Workshop memory`

Calibre should reduce workshop friction, preserve evidence, make operational state obvious and provide trustworthy financial answers.

---

## 2. Architectural laws

These are locked unless this roadmap is deliberately amended first.

1. **Item is the physical-object root.**
2. **Work is separate and optional.** One Item may have many Work records.
3. **Physical location is separate from workflow state.**
4. **Supabase is authoritative.** Browser state is never the master record.
5. **No resurrection of legacy `jobs`, `currentId`, or one giant mutable business state.**
6. **URLs/deep links identify the thing being viewed.**
7. **Media is uploaded once and reused by context.**
8. **Research produces structured findings with sources, confidence and explicit decisions.**
9. **Accepting evidence and applying it to canonical data are different actions.**
10. **Reference knowledge and bench evidence are distinct.**
11. **Costs are transactions; valuations are snapshots; sales are lifecycle records.**
12. **Private internal data is never exposed directly to customers or Club members.**
13. **Generic Item core; specialist watchmaking modules where appropriate.**
14. **Donor is an Item purpose/relationship, not a separate top-level object type.**
15. **Unknown stays unknown. No fake precision.**
16. **Schema changes are committed migrations.**
17. **A data-changing feature is not accepted until `change → save → refresh → confirm` succeeds.**
18. **Phone and DeX/desktop are separate acceptance targets.**
19. **Dead implementations are removed after replacement. Git is the archive.**
20. **Business metrics come from underlying records, never hand-entered totals.**
21. **Historical records are immutable where practical.** Completed Work, realised Sales, source documents and consumed stock remain auditable.
22. **Scale is designed in, not retrofitted.**
23. **Money must be traceable.** Every financial result must be explainable back to source transactions and allocations.
24. **Operational workflow and accounting truth are separate but linked.**
25. **Purchase is the commercial acquisition event; invoice/document is source evidence; Item remains the physical-object root.**
26. **A bundle/lot may produce multiple physical Items or stock records without losing acquisition provenance.**
27. **Shared costs must allocate without duplication.**
28. **Parts inventory cost belongs on Parts. Tools are capital/equipment. Consumables are operating spend.**
29. **A donor Item retains its acquisition cost and historical economics even if written off for resale.**
30. **Removing a material business record means Archive/Trash first, not blind hard delete.** Permanent deletion is only allowed when history, financial and dependency rules permit it.
31. **Public/member knowledge is a published projection, never direct database exposure.**
32. **Community contributions are evidence, not automatic truth.**
33. **OpenAI may interpret, search, rank, extract, draft and propose. Canonical data changes only through defined Calibre functions with explicit authority and auditability.**
34. **Material AI-proposed mutations require human approval unless an explicitly safe automation policy says otherwise.**
35. **OpenAI API credentials never live in the React client. Trusted backend/Edge Functions own model access.**
36. **Deterministic systems own calculations and measurements. AI may explain them but does not replace them.**
37. **The Calibre Classic design language is product infrastructure, not optional polish. New screens must use the same visual tokens.**

---

## 3. Locked visual identity — Calibre Classic

The accepted visual direction is retained and strengthened:

- **Palette:** charcoal / gunmetal / petrol / steel / pale metal.
- **Display typography:** Cormorant Garamond for brand, watch names and major headings.
- **Interface typography:** IBM Plex Sans.
- **Technical/data typography:** IBM Plex Mono.
- **Background:** deep charcoal with restrained petrol sunburst/radial light.
- **Cards:** translucent/frosted glass surfaces with soft blur, fine steel borders and subtle internal highlights.
- **Navigation:** floating menu treatment rather than heavy full-width bars where practical.
- **Phone:** compact floating bottom dock.
- **DeX/desktop:** floating top/side navigation with denser working surfaces.
- **Brand assets:** restrained monochrome maker marks beside Item titles where available.
- **Brand logo storage:** SVG preferred, transparent PNG fallback, typographic/monogram fallback.

The UI should feel like a modern precision instrument with vintage horological typography, not a generic admin dashboard and not a retro imitation.

---

## 4. Current state snapshot — 14 October 2026

Legend: ✅ accepted/working · 🟡 implemented or active but not fully accepted · ⬜ planned · 💤 deliberately deferred · 🧪 exploratory

| Phase | State | Approx. implementation progress | Current reading |
|---|---:|---:|---|
| A — Foundation, resilience & safe removal | 🟡 | ~80% | core scale/audit/backup discipline exists; restore, RLS tests and archive/trash policy remain |
| B — Acquisition | 🟡→✅ | ~96% | invoice → Purchase → Lot → receiving → Item/stock is connected; real acceptance remains |
| C — Workbench 2.0 / workshop | 🟡→✅ | ~84% | Job Card, templates, signed QC, hardened parts evidence and storage are live; Bench Mode and real acceptance remain |
| D — Parts, donors & storage | 🟡 | ~80% | stock, fit evidence and physical storage are live; donor economics/intelligence and lineage remain |
| E — Commerce, ledger & cashflow | 🟡 | ~66% | Item economics and Ledger are meaningful; broader money-in, reversals and cashflow semantics remain |
| F — Reports & Business Brain | 🟡 early | ~22% | summary foundations exist; monthly reports, graphs and recommendations remain |
| G — Listings & sales engine | 🟡 early | ~18% | sale foundation exists; multi-channel generation/publishing remains |
| H — Visual system & brand assets | 🟡 | ~45% | Calibre Classic exists in code but newer surfaces have drifted; consolidation required |
| I — Workshop tools & utilities | 🟡 | ~50% | Tool/Consumable registries exist; calculators, timers and calibration workflows remain |
| J — Timing / Timegrapher | 🟡 | ~35% | sample-clock timing foundation exists; workflow integration and hardware validation now active |
| K — OpenAI intelligence layer | 🟡 early | ~12% | research handoff exists; contextual copilot/tool use/voice/structured agents remain |
| L — Printing / QR / physical outputs | 🧪 | exploratory | after core acceptance; browser/PDF + desktop bridge preferred |
| M — Device modes / Smart Capture | 🟡 early | ~35% | phone/DeX foundations exist; Bench/Capture Station workflows remain |
| N — Search / command / attention layer | 🟡 | ~68% | unified search and universal New exist; command actions and attention centre remain |
| O — Customer / public / Club | 💤 | later | after internal truth and commerce are stable |
| P — Automation / learning loop | 💤 | later | manual workflows and AI controls first |

**Important:** percentages describe implementation progress, not Definition-of-Done acceptance.

---

## 5. Accepted baseline already in v2

### Acquisition

- invoice/photo/PDF intake and server extraction;
- source document preservation and duplicate protection;
- first-class Purchases and Purchase Lots;
- canonical Vendor/Source normalisation;
- receiving states and status-truth protection;
- Item/Part/Tool/Consumable receiving;
- shared-cost allocation and reallocation history;
- immutable imported invoice evidence;
- source financial discrepancy preservation;
- server-side Purchase search/pagination;
- Needs put-away and physical receiving destinations.

### Workshop

- dedicated Work Job Card;
- versioned Work Templates/checklists;
- diagnosis, priority, next action and blocker;
- measurements and timing-run linkage;
- part requirements and matching;
- reserve → fit evidence → consume → fulfil workflow;
- database-level protection against faking reserved/fulfilled part states;
- stock consumption requires confirmed/conditional fit evidence;
- Waiting-on-parts classification and resume only when all unresolved needs clear;
- QC checklist and completion gate;
- QC sign-off stamped to authenticated user;
- signed required QC required for completion;
- completion summary requirement;
- physical location visible/movable independently of Work state.

### Inventory / storage

- Items / Parts / Storage separation;
- hierarchical storage locations;
- permanent location movement history;
- Needs put-away queue;
- phone-friendly inline moves;
- Item passport/media/research/work/sale/history surfaces.

### Business

- Item economics and valuation foundations;
- sales records;
- Business Overview / Stock / Listings / Sales / Costs;
- Business Ledger;
- tool capital-spend and consumable operating-spend treatment;
- server-side summaries and bounded loading;
- global indexed search across core domains.

---

# DELIVERY ORDER

The next implementation order is deliberately dependency-driven:

`Foundation safety + visual-system consolidation → Workbench 2.0 + Timing integration → Donor/removal/inventory integrity → Reports/Cashflow → Tools/Command layer → OpenAI contextual intelligence → Release acceptance → Listings/Public/Automation`

The real-world acceptance path continues in parallel and must not be replaced by feature work.

---

## Phase A — Foundation, resilience and safe removal

**Status: 🟡 active and mandatory**

### Engineering

- [ ] generate and commit Supabase TypeScript database types;
- [ ] finish live-vs-repo migration audit;
- [ ] focused regression tests for critical workflows;
- [ ] RLS/security acceptance tests;
- [ ] error observability/system-health diagnostics;
- [ ] secondary-route scale audit;
- [ ] real backup/restore reconciliation drill.

### Remove / Archive / Trash model

Every Item, Part, Tool, Consumable and material business record needs a deliberate removal path.

- [ ] add consistent **Remove** action on relevant surfaces;
- [ ] default material records to Archive/Trash rather than hard delete;
- [ ] Trash view with Restore;
- [ ] dependency-aware permanent-delete rules;
- [ ] prevent permanent deletion where purchase cost, Work, fit evidence, stock consumption, sale, media, audit or donor history would be damaged;
- [ ] allow true accidental empty records to be permanently removed;
- [ ] recent-actions/undo where technically safe;
- [ ] audit every destructive or restoration action.

**Exit gate:** destructive operations must be predictable, recoverable and incapable of silently rewriting business history.

---

## Phase B — Acquisition and receiving acceptance

**Status: 🟡→✅ ~96% implemented**

Remaining:

- [ ] real invoice → Purchase → receiving → put-away save/refresh acceptance;
- [ ] explicit `received_at` / physical-intake semantics acceptance;
- [ ] representative Purchase finance reconciliation;
- [ ] phone acceptance;
- [ ] DeX acceptance.

**Exit gate:** every acquired object can answer: where did it come from, what did it really cost, what did I receive, and where is it now?

---

## Phase C — Workbench 2.0 and workshop operations

**Status: 🟡 advanced implementation; now the highest-value product phase**

### Workbench Command Centre

Replace the mental model of “list of Work records” with a working bench dashboard.

- [ ] **On My Bench** primary area with large active cards;
- [ ] Ready Next / Waiting / QC / Queue secondary areas;
- [ ] stronger next-action prominence;
- [ ] progress from copied checklist steps;
- [ ] smart exceptions: missing evidence, worse timing, unresolved blocker, part arrived, missing photo, ready for QC;
- [ ] Work priority recommendations based on blocker state, expected return, age, remaining effort and readiness;
- [ ] optional “I have 30/60/90 minutes” prioritisation;
- [ ] Attention Centre handoff for workshop issues.

### Bench Mode

A stripped-back mode for actual hands-on work.

- [ ] Start Bench Session / Finish Bench Session;
- [ ] large current-step and next-step presentation;
- [ ] one-tap Photo / Note / Measurement / Part Needed / Timing / Blocked actions;
- [ ] session labour duration capture;
- [ ] step-level microscope/photo capture;
- [ ] work session history;
- [ ] minimal-navigation phone layout;
- [ ] DeX expanded bench view.

### Workshop evidence

- [x] signed QC identity;
- [x] evidence-backed parts consumption;
- [x] completion gate;
- [ ] printable/generated Job Card;
- [ ] customer-safe service summary;
- [ ] repair decision log: Repair / Replace / Donor / Leave / Write off;
- [ ] structured bench measurements;
- [ ] photo-completeness prompts;
- [ ] before/after media comparison;
- [ ] service-consumable methodology notes where useful;
- [ ] real Waltham end-to-end acceptance on phone and DeX.

**Exit gate:** one real watch must progress through bench work, any parts path, timing, signed QC and completion without shadow notes or manual database fixes.

---

## Phase D — Parts, donors and physical storage

**Status: 🟡 ~80% implemented**

### Parts

- [x] stock inventory and physical locations;
- [x] needs, reservation, fit, consumption and fulfilment;
- [x] confirmed bench-fit evidence;
- [ ] consistent Remove/Archive/Trash actions;
- [ ] failed-fit/returned presentation;
- [ ] richer stock transaction history;
- [ ] quick measurement capture on parts.

### Donor economics and intelligence

A donor remains an economic asset/history source, not a zero-cost discarded Item.

- [ ] writing an Item off as donor retains full acquisition and shared costs;
- [ ] donor carrying cost visible in Item economics;
- [ ] harvested-part lineage: donor Item → part/assembly → recipient Item/Work;
- [ ] optional attributed donor cost when a harvested part is consumed;
- [ ] donor depletion and remaining-assemblies visibility;
- [ ] proactive donor compatibility suggestions;
- [ ] same-calibre/family suggestions remain leads, never proof;
- [ ] donor return/value reporting;
- [ ] fast Parts Harvesting Mode with photo + part creation from one donor session.

### Storage

- [ ] phone + DeX save/refresh acceptance;
- [ ] QR location lookup/move;
- [ ] printable labels;
- [ ] storage stocktake flow.

**Exit gate:** every consumed or harvested part remains traceable to source, fit evidence, cost basis and recipient.

---

## Phase E — Commerce, ledger and cashflow

**Status: 🟡 meaningful implementation exists**

### Money In / Money Out

Expand beyond watch sales without corrupting profit reporting.

- [ ] general **Money In** action;
- [ ] revenue types: service/repair income, parts sales, accessories, postage recovered and miscellaneous business income;
- [ ] reimbursement/refund treatment distinct from revenue;
- [ ] owner capital contributions distinct from revenue;
- [ ] owner drawings distinct from expenses where appropriate;
- [ ] cash-position definition and reconciliation;
- [ ] refunds, discounts and marketplace adjustments;
- [ ] formal reversal/correction workflow rather than destructive financial edits;
- [ ] fees/postage reconciliation;
- [ ] representative finance acceptance.

### Economics rules

- [x] acquisition cost remains attached to Item;
- [ ] donor conversion never removes or hides acquisition cost;
- [ ] stock value at cost vs valuation vs realised proceeds clearly separated;
- [ ] projected profit and realised profit visually separated;
- [ ] cash movements explainable from Ledger and sale/purchase records.

**Exit gate:** every business total must reconcile from transactions without valuations masquerading as cash.

---

## Phase F — Monthly reports, graphs and Business Brain

**Status: 🟡 early foundation**

### Reports

Build **Business → Reports** over existing canonical data.

- [ ] month selector;
- [ ] Year to Date;
- [ ] custom date range;
- [ ] Revenue;
- [ ] Realised profit;
- [ ] Purchase spend;
- [ ] Parts/workshop costs;
- [ ] Other expenses;
- [ ] Other income;
- [ ] Stock acquired / sold;
- [ ] Stock value and capital tied up;
- [ ] Average profit per Item;
- [ ] Average margin / ROI;
- [ ] Average days to sale;
- [ ] Work completed;
- [ ] Parts consumed;
- [ ] Donor usage/value recovery;
- [ ] exportable monthly snapshot.

### Graphs

- [ ] revenue and profit over time;
- [ ] spend vs sales;
- [ ] profit by Item;
- [ ] profit by acquisition source;
- [ ] channel performance;
- [ ] stock ageing;
- [ ] capital tied up by age/category;
- [ ] potential-profit pipeline;
- [ ] bench hours vs realised profit when labour capture matures.

### Business Brain

- [ ] month-over-month narrative;
- [ ] slow/dead-stock scoring;
- [ ] most/least profitable Items;
- [ ] source/vendor performance;
- [ ] sale-ready prioritisation;
- [ ] Work blockers and likely quickest wins;
- [ ] “what should I work on next?” reasoning;
- [ ] later AI-generated report narrative grounded only in deterministic metrics.

---

## Phase G — Listing and sales engine

**Status: 🟡 early foundation**

- [ ] true multi-listing/multi-channel records;
- [ ] eBay/Facebook/Calibre-site variants;
- [ ] listing photo roles/order;
- [ ] publication checklist;
- [ ] offer accepted/rejected/countered lifecycle;
- [ ] listing URL tracking;
- [ ] post-sale handoff;
- [ ] AI-assisted listing drafting using only verified Calibre facts;
- [ ] never invent originality, service state, water resistance, material or technical certainty.

---

## Phase H — Visual system restoration and brand assets

**Status: 🟡 active, should happen early rather than at the end**

### Calibre Classic consolidation

- [ ] create shared design tokens/component primitives for glass panels, cards, headings, status chips and navigation;
- [ ] restore consistent charcoal/petrol sunburst background on all major routes;
- [ ] frosted-glass tile treatment with sensible performance fallbacks;
- [ ] floating navigation on DeX/desktop;
- [ ] floating bottom dock on phone;
- [ ] remove visual drift introduced by route-specific CSS;
- [ ] preserve classic Cormorant + IBM Plex hierarchy;
- [ ] responsive density tuning for Galaxy phone and DeX.

### Maker marks

- [ ] `brand_assets` library;
- [ ] approved monochrome maker logo beside Item/watch titles;
- [ ] SVG preferred;
- [ ] transparent PNG fallback;
- [ ] text/monogram fallback;
- [ ] never depend on remote third-party logo hotlinks.

**Exit gate:** Home, Inventory, Workbench, Business, Intake and Item Workspace must clearly look like one product.

---

## Phase I — Workshop tools and utilities

**Status: 🟡 foundation exists**

### Existing asset registry

- [x] Tool registry;
- [x] Consumable registry;
- [x] receiving and storage linkage;
- [ ] service/calibration dates;
- [ ] richer asset lifecycle;
- [ ] low-stock/reorder workflow.

### Calibre Tools drawer

Build tools that are specific to this business rather than duplicating a phone calculator.

- [ ] auction max-bid calculator;
- [ ] landed-cost calculator;
- [ ] profit / margin / ROI calculator;
- [ ] mm / inch / ligne converter;
- [ ] crystal/case measurement helper;
- [ ] timing comparison calculator;
- [ ] bench measurement scratchpad with Save to Work;
- [ ] ultrasonic/soak/test timers;
- [ ] quick QR/label generator;
- [ ] quick camera/microscope capture;
- [ ] Parts/Donor Finder shortcut;
- [ ] Movement Finder shortcut;
- [ ] knowledge/lubrication lookup.

---

## Phase J — Timing and Timegrapher in the Work lifecycle

**Status: 🟡 active foundation; no longer treated as an isolated deferred tool**

### Principle

Timing belongs in three contexts:

1. **Workbench** — a real service/repair step;
2. **Item/Work history** — permanent evidence;
3. **Tools** — standalone test when no Work is active.

### Canonical timing checkpoints

For appropriate mechanical templates:

- [ ] Intake / pre-service timing;
- [ ] first stable run after reassembly;
- [ ] regulation runs;
- [ ] final QC timing;
- [ ] optional positional sequence.

### Data

Persist:

- [x] BPH;
- [x] rate;
- [x] beat error;
- [ ] position;
- [ ] sample duration;
- [ ] signal confidence;
- [ ] microphone/device identity;
- [ ] lift angle when explicitly known/entered;
- [ ] amplitude only after defensible hardware validation.

### UX

- [ ] launch Timegrapher directly from current Work step with Item/Work/stage preselected;
- [ ] no manual refiling after capture;
- [ ] Before → Reassembly → Regulation → Final comparison graph;
- [ ] positional spread summary;
- [ ] signal-quality warnings;
- [ ] final timing requirement configurable by Work Template;
- [ ] permanent timing history on Item.

### Interpretation

Deterministic detector owns measurements. AI may explain trends, for example “rate improved but positional spread worsened”, while clearly labelling mechanical causes as possibilities rather than facts.

### Hardware

- [ ] validate incoming USB timegrapher mic on Android;
- [ ] validate same mic on PC/DeX where applicable;
- [ ] compare against reference instrument before detector changes;
- [ ] calibration notes/device profile.

---

## Phase K — OpenAI intelligence layer

**Status: 🟡 early, strategically important**

### Architecture

`Calibre UI → trusted Supabase/backend layer → OpenAI → approved Calibre functions → Supabase`

The model never receives unrestricted database write authority and never holds canonical truth in conversation state.

### K1 — Contextual Calibre Copilot

- [ ] **Ask Calibre** inside Item, Work, Intake, Research and Business surfaces;
- [ ] automatic current Item/Work context;
- [ ] structured photo analysis proposals;
- [ ] structured research findings with confidence/evidence;
- [ ] reference + Calibre Knowledge search;
- [ ] listing draft generation from verified facts;
- [ ] explanation of timing/finance/workshop data;
- [ ] proposed actions rendered before execution.

### K2 — Workshop Assistant

- [ ] Bench Mode voice commands;
- [ ] record note/measurement/fault hands-free;
- [ ] mark checklist state through approved function calls;
- [ ] add Part Need by voice;
- [ ] open timing step;
- [ ] retrieve lubrication/reference notes;
- [ ] microphone/camera context aware of current Work;
- [ ] material data mutations require confirmation.

### K3 — Acquisition and Business intelligence

- [ ] auction-lot image/text analysis;
- [ ] missing-evidence detection;
- [ ] likely repair complexity suggestions;
- [ ] Calibre computes economics/max bid deterministically;
- [ ] monthly-report narrative;
- [ ] stock/work prioritisation;
- [ ] anomaly detection and Attention Centre summaries.

### K4 — Workshop Memory

Use accumulated Calibre evidence rather than generic memory:

- [ ] similar repairs previously completed;
- [ ] previous successful/rejected part fits;
- [ ] donor usage history;
- [ ] recurring fault patterns by movement family;
- [ ] historical timing outcomes;
- [ ] supplier/source outcomes;
- [ ] median bench time/profit by category once enough data exists.

### K5 — Calibre Agent

Later, allow multi-step orchestration through approved tools, for example:

`load Item → inspect open Work → check parts → search donor stock → retrieve references → prepare bench-session brief`

No silent canonical rewrites.

---

## Phase L — Printing, labels and physical outputs

**Status: 🧪 exploratory after core acceptance**

- [ ] browser/PDF Item labels;
- [ ] storage labels;
- [ ] Job Cards;
- [ ] repair reports;
- [ ] invoices/receipts;
- [ ] QR Passport labels;
- [ ] desktop Print Bridge for printers not exposed to Android/browser printing.

---

## Phase M — Device modes and Smart Capture

**Status: 🟡 early foundation**

### Phone

Fast capture, status, photos, measurements, parts, timing, storage, QR, Bench Mode voice.

### DeX/desktop

Research, finance, comparisons, dense administration, graphs, full Workbench command centre.

### Capture Station

- [ ] microscope/camera capture directly into selected Item/Work/step;
- [ ] stable media ownership;
- [ ] quick evidence classification;
- [ ] before/after capture workflow.

---

## Phase N — Search, command and Attention Centre

**Status: 🟡 active**

### Global search expansion

- [x] Items;
- [x] Work;
- [x] Parts;
- [x] Invoices;
- [ ] movement/calibre Knowledge;
- [ ] donors;
- [ ] locations;
- [ ] vendors/sources;
- [ ] ledger entries;
- [ ] listings/offers/sales;
- [ ] tools/consumables.

### Command palette

DeX/desktop keyboard and phone search entry should support actions such as:

- [ ] `Item 42` / `Work 7` open;
- [ ] new cost / money in;
- [ ] move Item / put away;
- [ ] add Part Need;
- [ ] find donor;
- [ ] start named Work Template;
- [ ] auction calculator;
- [ ] timing;
- [ ] open source invoice/document;
- [ ] start Bench Session.

### Attention Centre

- [ ] parts arrived / ready to resume;
- [ ] Work blocked too long;
- [ ] QC waiting;
- [ ] missing listing photos;
- [ ] stock unvalued;
- [ ] aged stock;
- [ ] invoice/Purchase exception;
- [ ] donor candidate found;
- [ ] low consumable stock;
- [ ] optional AI prioritised summary over deterministic alerts.

---

## Phase O — Customer, public and Calibre Club

**Status: 💤 later**

Customer/member access must come from an explicitly sanitised publication projection.

Potential outputs:

- customer-safe Passport;
- repair/service report;
- invoice/receipt;
- public catalogue;
- QR provenance;
- owned-watch area;
- optional Club/community evidence workflows.

---

## Phase P — Automation and learning loop

**Status: 💤 after manual workflows and AI authority boundaries are proven**

Potential automation:

- purchase email/invoice capture;
- shipment/arrival monitoring;
- stale Work alerts;
- auction intake;
- listing/publication;
- finance summaries;
- reorder warnings;
- scheduled business briefs;
- safe proactive Copilot preparation.

---

# RELEASE CANDIDATE / MAIN URL CUTOVER GATE

`app.calibreco.com.au` remains on the legacy app until v2 is demonstrably safer to run.

Required before cutover:

1. [ ] one complete real-world workflow succeeds: purchase → Item → research → Work → parts if required → timing → signed QC → valuation/listing → sale → financial result;
2. [ ] save → refresh → confirm passes on all critical writes;
3. [ ] phone acceptance pass;
4. [ ] DeX/desktop acceptance pass;
5. [ ] physical storage acceptance;
6. [ ] finance reconciliation acceptance;
7. [ ] safe Remove/Archive/Trash behaviour on Items and Parts;
8. [ ] core high-volume routes remain bounded/fast;
9. [ ] structured backup + private media archive exist and real restore drill succeeds;
10. [ ] remaining active legacy-route leakage removed;
11. [ ] final Verify and Deploy green;
12. [ ] custom-domain routing/auth/private-media/write validation;
13. [ ] rollback plan documented; legacy app frozen, not deleted.

Visual-system restoration can land before this gate. Deep OpenAI automation and customer/public features do not block the gate unless they become required daily workflow before cutover.

---

# IMMEDIATE EXECUTION PLAN

### 1. Real workshop acceptance

- [ ] run the Waltham through the current real workflow;
- [ ] record friction rather than inventing synthetic evidence;
- [ ] validate checklist → parts → timing → QC → completion.

### 2. Calibre Classic restoration

- [ ] consolidate theme tokens;
- [ ] sunburst background everywhere appropriate;
- [ ] frosted glass cards;
- [ ] floating navigation;
- [ ] restore classic typography consistently;
- [ ] eliminate route-specific visual drift.

### 3. Workbench 2.0 + Bench Mode

- [ ] On My Bench command centre;
- [ ] quick capture actions;
- [ ] bench-session labour timing;
- [ ] smarter exception surfacing;
- [ ] timing checkpoints integrated into Work Templates.

### 4. Safe removal + donor economics

- [ ] Remove/Trash/Restore for Items/Parts;
- [ ] dependency-aware hard delete;
- [ ] donor cost retention;
- [ ] donor lineage/depletion;
- [ ] donor-to-recipient part history.

### 5. Business reporting and cashflow

- [ ] Money In workflow;
- [ ] owner capital vs revenue separation;
- [ ] monthly reports and graphs;
- [ ] custom range / YTD;
- [ ] cash-position semantics;
- [ ] reversal-based corrections.

### 6. Tools + command layer

- [ ] auction/profit calculators;
- [ ] measurement/timing tools;
- [ ] Attention Centre;
- [ ] command palette actions;
- [ ] maker brand assets beside titles.

### 7. OpenAI Phase K1

After the above functions expose clean, auditable application actions:

- [ ] contextual Ask Calibre;
- [ ] photo/research structured proposals;
- [ ] reference search;
- [ ] verified-fact listing drafts;
- [ ] proposed-action confirmation pattern;
- [ ] trusted backend API integration and usage/cost logging.

### 8. Foundation acceptance in parallel

- [ ] DB types;
- [ ] migration audit;
- [ ] RLS/regression tests;
- [ ] error observability;
- [ ] backup/restore drill.

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
12. financial calculations trace to source records;
13. no duplicate legacy implementation remains active on the accepted route;
14. backup/recovery requirements are satisfied before business-critical cutover;
15. physical-location behaviour is explicit where relevant;
16. deterministic calculations remain deterministic;
17. AI output is labelled as proposal/interpretation unless it is confirmed canonical data;
18. AI-triggered mutations use approved functions and are auditable;
19. the Calibre Classic design system is respected;
20. the roadmap is updated to reflect accepted reality.
