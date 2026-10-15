# Calibre & Co. — Final Product Roadmap

**Status:** LOCKED CANONICAL ROADMAP  
**Effective:** 16 October 2026  
**Application:** Calibre v2  
**Production:** `https://app.calibreco.com.au`

> This is the single canonical product roadmap for Calibre & Co.
>
> It supersedes every previous roadmap, staged build list, product-plan discussion and informal sequence. Supporting technical documents may explain implementation details, but they do not override this document.
>
> New ideas do not create parallel roadmaps. They must either fit an existing phase, be explicitly deferred, or be accepted through a deliberate amendment to this document.

---

# 1. Product Vision

Calibre is the operating system for a watch and collectables workshop and resale business.

For every physical Item, Calibre should be able to answer:

1. **What is it?** — identity, Passport, movement, research, evidence and confidence.
2. **Where is it?** — storage, workshop position and physical state.
3. **What does it need?** — work, parts, measurements, research, timing, QC and unresolved blockers.
4. **What do we know?** — technical references, movement knowledge, compatibility evidence and previous workshop outcomes.
5. **What is it worth?** — acquisition cost, invested cost, valuation, target sale, potential profit and realised return.
6. **What should happen next?** — the most useful next workshop/business action based on evidence, readiness, economics and current state.

The complete lifecycle is:

**Acquire → Identify → Research → Decide → Work → Parts → Timing → Verify → Value → Publish/List → Sell → Learn**

Every completed repair, failed repair, part fit, donor harvest, timing result, sale and research finding should improve future decisions.

---

# 2. Final Product Shape

Calibre is organised into five connected systems.

## 2.1 Workshop

Owns:

- Workbench
- Work records
- Workshop Induction
- Procedures
- Bench Mode
- current/next action
- guided checks
- findings
- diagnosis
- evidence capture
- timing
- parts required for Work
- blockers
- Final Verification
- Release
- bench time
- Work history

## 2.2 Inventory

Owns:

- Items
- Item identity
- Passport
- movement identity
- serial/reference information
- media
- physical storage
- donors
- harvested parts
- ownership/lifecycle status

## 2.3 Knowledge

Owns:

- movement records
- technical sources
- movement guidance
- procedures and procedure versions
- lubrication guidance
- compatibility evidence
- diagnostic relationships
- watchmaking taxonomy
- Workshop Memory

## 2.4 Business

Owns:

- acquisition
- landed cost
- expenses
- income
- ledger
- stock value
- valuation
- listings
- sales
- realised profit
- potential profit
- cashflow
- financial analytics
- repair economics
- acquisition intelligence

## 2.5 Public

Owns the intentionally published customer-safe projection only:

- catalogue
- public Item detail
- Customer Passport
- service/restoration summary
- Certificate
- QR access
- enquiry
- later listing integrations

The public system never reads or exposes private workshop/business data directly.

---

# 3. Non-Negotiable Architecture Rules

## 3.1 Item is the permanent physical root

A watch, clock, part, tool or other object remains an Item throughout its life.

Work, finance, research, parts, storage, sales and public outputs attach to the Item. They do not replace it.

## 3.2 One fact, one canonical owner, many views

Calibre must have only:

- one current Work state
- one Next Action engine
- one timer/session model
- one evidence model
- one movement identity
- one diagnostic graph
- one financial ledger
- one parts/compatibility model
- one public publication model

Workbench, Bench Mode, reports, certificates, customer pages and AI all read from these canonical sources.

Duplicate state machines are not allowed.

## 3.3 Evidence before certainty

Vintage watches contain uncertainty.

Identity, diagnosis, compatibility, technical information and valuations should use explicit states such as:

**Confirmed · Probable · Possible · Unknown**

Where appropriate, Calibre records why something is believed and its source/evidence grade.

## 3.4 Human approval remains authoritative

Calibre may:

- analyse
- search
- compare
- explain
- rank
- suggest
- prepare actions

Material permanent decisions remain explicit and auditable.

**Calibre recommends. The watchmaker decides.**

## 3.5 Deterministic systems own measurements and money

Timing, measurements, inventory quantities and financial values come from actual records and deterministic calculations.

AI may interpret or explain them. AI must not invent them.

## 3.6 History is preserved

Normal removal/correction follows:

**Archive → Trash → Restore**

or an auditable reversal/revision.

Completed historical evidence is not silently rewritten when procedures or intelligence improve.

## 3.7 Phone and DeX are both first-class

They are not the same layout squeezed to different widths.

**Phone prioritises:**

- current workshop action
- Bench Mode
- photos
- evidence capture
- measurements
- timing
- quick actions
- QR
- receiving

**DeX/desktop prioritises:**

- multi-pane Work
- research
- Knowledge
- finance
- reports
- comparisons
- administration
- larger Workbench views

## 3.8 Real and test data are explicitly separated

Every Item/Work that can influence learning or finance must be classifiable as:

- **Real**
- **Test / Demo**

Test/Demo records are excluded by default from:

- Workshop Memory
- diagnostic outcome statistics
- movement/fault frequency statistics
- business reports
- financial KPIs
- acquisition intelligence
- public catalogue
- customer outputs

---

# 4. Canonical Workshop Reasoning Model

The core diagnostic model is:

**Finding → Hypothesis → Check → Evidence → Conclusion → Action**

Diagnosis is a graph, not a flat checklist or simple tree, because multiple findings can support, weaken or rule out the same cause.

Qualitative support states are:

- Strongly supported
- Supported
- Possible
- Weak
- Ruled out

Internal numeric ranking may be used to sort hypotheses but is not presented as fake probability.

Normal results are evidence. They must actively weaken or rule out possibilities where appropriate.

The system distinguishes:

### Next Workshop Action
The physically sensible thing to do now, respecting procedure and prerequisites.

### Next Diagnostic Check
The most useful discriminating test, which may be queued until the correct physical stage.

OpenAI is an interpretation/ranking layer above structured evidence. It is not the source of canonical facts.

---

# 5. What Is Retired or Absorbed

The following concepts must not continue as independent competing systems.

## 5.1 Manual operational `next_action`

Retire it as a source of truth.

The Job State Engine owns **Next Workshop Action**.

A free-text replacement may exist as **Workshop note** or **Planned follow-up**, but it cannot compete with calculated operational state.

## 5.2 Raw stage-status dropdowns

Retire unrestricted direct status editing.

Replace with validated actions:

- Begin stage
- Complete stage
- Block stage
- Resume stage
- Mark N/A where allowed

Completion must fail when required active checks/evidence remain.

## 5.3 Giant flat checklist as the primary Work UI

Retire it as the working interface.

The procedure list becomes a navigator/overview. Detailed work happens in the current-action Bench surface.

## 5.4 Separate old generic diagnosis engine

Fold useful deterministic rules into the canonical diagnostic graph.

There must be one Diagnosis surface combining:

- structured evidence graph
- source-backed movement knowledge
- Workshop Memory where applicable
- AI interpretation

## 5.5 Duplicate QC systems

Replace with exactly two concepts:

### Final Verification
Actual testing, timing, inspection and evidence.

### Release
Short final sign-off, completion summary and closure.

No repeated duplicate QC questionnaire.

## 5.6 Duplicate capture/data-entry tools

Use one Capture architecture with many contextual entry points.

Photo, measurement, timing, finding, Part Need and note components must save to the same canonical records regardless of where opened.

## 5.7 Separate Home dashboard

Do not build/maintain a competing Home dashboard.

**Workbench is the operational landing page.**

## 5.8 Separate utility pages

Do not create standalone pages for every calculator/finder.

Use one Tools/Command surface and contextual tools.

## 5.9 Separate Ask Calibre destination

Ask Calibre becomes a contextual drawer/assistant when mature, not a parallel application area.

## 5.10 Separate Voice Assistant architecture

Voice is another input method into the same Capture/Command/Action system.

---

# 6. Final Navigation and Layout

## 6.1 DeX / desktop global navigation

Use a compact left rail:

- **Workbench**
- **Inventory**
- **Business**
- **Knowledge**

Secondary/global controls:

- Search
- Tools
- Attention
- Settings

Public/Catalogue becomes a first-class area only when the public layer is released.

## 6.2 Phone global navigation

Bottom navigation:

- **Work**
- **Items**
- **Business**
- **More**

When a bench session is active, show a persistent return control above navigation:

**● BENCH LIVE · [Item] · [elapsed/working time]**

## 6.3 Workbench — DeX/desktop

Primary operational lanes:

- On Bench
- Ready
- Waiting
- Final Verification
- Queue

Cards show only decision-useful information:

- Item
- maker/movement where known
- Work type
- current stage
- current action
- priority
- actual bench time
- blocker
- parts status
- verification readiness

## 6.4 Workbench — phone

Do not use horizontally scrolling desktop Kanban.

Use count/filter tabs:

**On Bench · Ready · Waiting · Verification · Queue · All**

Display vertically stacked cards with a prominent **Continue** action.

## 6.5 Item page

Canonical sections:

- **Overview**
- **Passport**
- **Work**
- **Commerce**
- **Public** (when publication exists)

### Overview
Identity summary, media, condition, storage and operational state.

### Passport
Movement, serial/reference, dimensions, research and confidence/evidence.

### Work
All current and historical Work.

### Commerce
Acquisition, costs, valuation, sale and return.

### Public
Publication preview, Customer Passport, catalogue state and Certificate.

## 6.6 Work workspace — DeX/desktop

Use three panes.

### Left — Job Navigator

Shows stages, progress, blockers and check counts.

Example:

- ✓ Intake
- ✓ Access
- ● Targeted disassembly
- ○ Repair
- ○ Reassembly
- ○ Verification

### Centre — Current Action

The primary working surface:

- instruction
- required/suggested evidence
- measurement/tool action
- structured answer
- source-backed guidance
- complete/next controls

### Right — Calibre Intelligence

Context only:

- active findings
- diagnostic view
- queued diagnostic check
- movement guidance
- Workshop Memory
- parts/donor match
- blocker
- relevant technical reference

## 6.7 Work workspace — phone

Show the centre/current-action pane first.

Sticky header includes:

- Item/Work
- current stage
- timer
- Pause/Resume

Bottom actions:

- **Steps**
- **Capture**
- **Next**
- **More**

`Steps` opens the Job Navigator as a drawer/sheet.

`More` contains Diagnosis, Research, Parts, Knowledge and History.

---

# 7. Core Workshop Capabilities

## 7.1 Workshop Induction

Every unplanned Work begins with structured incoming assessment before a repair/service procedure is selected.

Findings created during induction feed job planning and diagnosis.

## 7.2 Dynamic Job Plan

Calibre may recommend changing a plan when evidence changes, but material changes require user approval.

Plan revisions are versioned and auditable.

Examples:

- Assessment → Repair
- Repair → Full service
- Repair → Donor / Write-off

## 7.3 Procedure Studio and procedure versioning

Procedures become structured Knowledge objects rather than hard-coded generic checklists.

A procedure version may define:

- stages
- checks
- branching
- prerequisites
- answer types/options
- problem values
- expected evidence
- measurements
- tools
- warnings
- lubrication guidance
- references
- diagnostic effects
- completion criteria

Existing Work stays pinned to the version it began with unless explicitly migrated.

## 7.4 Job Step Navigator

Every Work has fast navigation across stages.

Stage states may show:

- Complete
- Current
- Finding
- Blocked
- check progress

Browsing another stage does not change which stage is operationally current.

## 7.5 Unified Capture

One Capture system supports:

- Photo
- Observation/note
- Measurement
- Timing
- Finding/problem
- Part needed
- Blocked/reason

Context determines attachment.

Evidence opened from a guided check attaches to that exact check where possible.

## 7.6 Bench/Component State

Calibre records the physical state of the watch during active Work.

Examples:

- movement removed
- hands removed
- dial removed
- balance removed — tray A
- train removed — tray B
- barrel unopened
- stem/crown — tray C

This powers Resume Snapshot, prerequisites, missing-component warnings and safer reassembly.

## 7.7 Resume Snapshot

Returning to Work shows:

- last session
- where work stopped
- last completed action
- current findings
- removed components/trays
- parts waiting
- outstanding measurements
- blocker
- next workshop action
- queued diagnostic check

## 7.8 Reset Job

Provide controlled reset/restart options.

### Restart workshop
Clears workshop execution state while retaining the underlying Item/Passport/commerce records.

### Restart procedure
Preserves induction/findings but rebuilds procedure progress.

### Clear test/demo data
Allows aggressive reset for Test/Demo Work without contaminating history/learning.

Real Work resets remain auditable and preserve historical versions where necessary.

## 7.9 Bench timer

Canonical model:

**Start → Pause → Resume → Finish**

Paused time does not count as bench time.

A deliberate workshop action may automatically resume a paused session:

- Save result
- Complete check
- Next
- record measurement
- capture photo
- save timing
- add finding/Part Need

Browsing/scrolling/opening information does not resume the timer.

Persist working/paused segments so finance and Workshop Memory use true bench time.

---

# 8. Timing

Timing is part of Work, not merely a standalone tool.

Canonical checkpoints:

- Pre-service
- Post-reassembly
- Regulation
- Final Verification
- optional additional runs

Persist:

- rate
- beat error
- BPH
- position
- duration
- signal confidence
- microphone/device
- lift angle and source status where known
- amplitude only when technically validated

Add:

- guided positional sequence
- pre/post comparison
- rate/beat-error improvement
- positional spread
- average/best/worst positions
- USB microphone/device profiles
- calibration/reference-instrument validation

Do not expose amplitude as reliable until validated against appropriate hardware/reference testing.

---

# 9. Knowledge, Movement Intelligence and Workshop Memory

## 9.1 Movement identity gate

Movement identity remains:

**Candidate → Probable → Confirmed**

Movement-specific procedure/diagnostic effects only activate at an appropriate evidence threshold.

## 9.2 Source hierarchy

Prefer:

1. manufacturer/service technical material
2. trusted technical/watchmaking references
3. calibre/family references with explicit applicability
4. workshop-verified outcomes
5. inference/candidate material

Inference is never presented as manufacturer documentation.

## 9.3 Watchmaking taxonomy

Create canonical structured categories beneath free-text notes:

**Component → Symptom → Cause → Action → Outcome**

Examples:

- Balance → radial wobble → damaged staff/pivot → replace staff → successful
- Keyless works → rough winding → sliding pinion wear → replace/repair → successful

Original notes remain preserved.

This taxonomy makes Workshop Memory statistically useful rather than dependent on fuzzy wording.

## 9.4 Workshop Memory

Only resolved **Real** Work feeds Workshop Memory by default.

Store relationships among:

- maker
- movement/calibre/family
- symptom
- measurement
- diagnosis
- corrective action
- part/donor
- lubrication
- timing before/after
- verification outcome
- bench time
- economic result

Workshop Memory may surface:

- previous similar repairs
- common confirmed causes
- previous successful fixes
- previous failed fixes
- useful discriminating checks
- typical bench time
- typical parts
- expected timing outcome

It is empirical evidence, not automatic truth.

## 9.5 Lubrication intelligence

Movement-specific lubrication entries include:

- component
- application point
- lubricant
- quantity/application guidance
- source
- confidence/evidence grade

Relevant guidance appears inline at the correct Bench step.

---

# 10. Parts and Donor Intelligence

Compatibility is an evidence graph.

Grades include:

- Manufacturer documented
- Technical reference
- Same calibre
- Measured match
- Successfully fitted
- Failed fit
- Unknown

Successful and failed real fits are especially valuable Workshop Memory.

Track donor lineage permanently:

**Donor Item → harvested component → recipient Work → recipient Item**

Donor conversion never erases acquisition cost.

Track:

- donor purchase/allocated cost
- harvested components
- remaining assemblies
- compatibility evidence
- fit outcome
- cost allocation
- value recovered

From a Part Need, Parts/Donor Finder searches:

1. normal Parts stock
2. documented compatible parts
3. donor stock
4. same-calibre Items
5. previous successful fits

Results clearly distinguish:

**Confirmed compatibility**

from

**Worth investigating**

---

# 11. Diagnosis Surface

There is one Diagnosis experience.

Primary presentation:

### Active Fault
The problem currently being investigated.

### Current View
Leading hypothesis/family and qualitative support state.

### What supports it
Structured evidence for.

### What argues against it
Structured evidence against.

### Still unknown
Missing evidence.

### Next Diagnostic Check
Most useful discriminating test.

Expandable controls:

- Why?
- Evidence
- Other possibilities
- Workshop Memory
- Relevant technical source

AI reasoning becomes visibly **out of date** when meaningful new evidence is recorded.

Meaningful stale triggers include:

- new/changed finding
- diagnostic branch answer
- timing run
- part fit/failure
- movement identity change
- research result
- hypothesis ruled out
- major measurement

Routine physical task completion alone does not necessarily stale reasoning.

---

# 12. Final Verification and Release

## Final Verification

Performs actual final work:

- functions
- timing
- visual condition
- assembly/casing
- cleanliness
- repair outcome
- required evidence

## Release

Short sign-off only:

- required verification complete
- unresolved Part Needs clear/accepted
- final timing present where required
- completion summary
- customer/public outcome fields where relevant
- close Work

Release cannot bypass required evidence/checks.

---

# 13. Calibre State, Attention and Next Best Action

Create a shared operational state for each Item/Work across:

- Identity
- Research
- Workshop
- Parts
- Timing
- Verification
- Sales readiness
- Publication readiness

Do not collapse everything into one arbitrary score.

Calibre State drives:

- Next Workshop Action
- Work prioritisation
- blockers
- sale readiness
- public readiness
- Attention Centre

Attention Centre surfaces deterministic issues such as:

- part arrived
- donor match
- Work blocked too long
- reasoning out of date
- required photo missing
- required measurement missing
- timing regression
- verification pending
- stock ageing
- missing valuation
- low consumables
- financial anomaly
- repair economics deteriorating

Future prioritisation may support:

- I have 30 minutes
- I have 60 minutes
- I have an evening

and rank useful Work accordingly.

---

# 14. Business and Finance

The ledger is the canonical financial record.

Distinguish capital movements from income. Owner contribution is not revenue.

Historical financial corrections use reversal/correction entries rather than silently rewriting transactions.

## 14.1 Item cost model

Track where applicable:

### Acquisition
- hammer/buy price
- buyer premium
- inbound postage
- tax/GST where applicable
- collection/travel allocation
- lot allocation

### Workshop
- parts
- consumables
- external services
- bench time
- optional assigned labour value

### Selling
- marketplace fees
- payment fees
- outbound postage
- packaging
- advertising

## 14.2 Two profit concepts

### Cash Profit
Actual cash return after real cash costs.

### Economic Profit
Cash Profit minus an assigned value for own bench time.

Own labour is not falsely presented as cash leaving the bank, but it is used to compare the economic quality of jobs.

## 14.3 Item-level outputs

Calculate:

- true landed cost
- total invested cash
- break-even sale price
- minimum acceptable sale
- target sale
- potential profit
- realised Cash Profit
- Economic Profit
- margin
- ROI
- profit per bench hour
- holding time
- capital return per day

## 14.4 Business analytics

Support period reporting:

- Month
- Previous month
- YTD
- Custom range

Metrics include:

- revenue
- realised Cash Profit
- Economic Profit
- purchase spend
- parts/workshop cost
- stock value
- capital tied up
- average profit per Item
- average ROI
- average days to sale
- Work completed
- bench hours
- donor value recovered
- potential-profit pipeline

Additional workshop/business statistics include:

- most time spent on a watch
- average repair/service time
- most-seen maker
- most-seen movement/calibre
- most common confirmed fault
- most common part requirement
- most profitable Item
- highest ROI Item
- highest profit/hour Item
- most profitable maker
- most profitable movement/calibre
- average repair cost by movement
- stock ageing
- acquisition-source performance
- sales-channel performance

## 14.5 Repair Economics

During Work, show when economics materially deteriorate:

- money invested
- actual bench hours
- remaining known cost
- expected finished value
- potential return
- profit/hour

Recommendations may include:

- continue repair
- use donor
- replace component
- sell as-is
- harvest for parts
- write off

These are recommendations, not automatic decisions.

## 14.6 Acquisition Intelligence

Once enough real history exists, auction/buy evaluation may use actual Calibre outcomes:

- historic acquisition price
- repair success rate
- average parts cost
- average bench time
- realised sale value
- profit
- ROI
- time to sale

Outputs may include a suggested maximum hammer/buy price with assumptions and confidence.

---

# 15. Public Calibre

Public Calibre begins as catalogue/passport, not ecommerce.

## 15.1 Publication model

Internal Item data is never exposed directly.

Create a versioned published projection:

**Draft → Ready to publish → Published**

The published snapshot contains only approved fields and media.

Internal changes do not silently alter a published customer page until republished.

## 15.2 Permanent public Item identity

QR codes point to a stable public Item ID, not a temporary listing.

That identity can survive:

**For sale → Sold → Serviced again → Customer-owned**

## 15.3 Catalogue V1

Customer-facing site initially supports:

- catalogue
- available Items
- optional sold archive
- Item detail
- approved images
- maker/model/era
- dimensions/material where verified
- movement where verified
- curated condition
- service/restoration summary
- asking price where applicable
- enquiry

No checkout/customer account is required for V1.

## 15.4 Customer Passport

Customer-safe Passport may include:

- identification
- movement/calibre
- serial/reference
- dimensions/materials
- selected provenance/research
- approved photos
- service/restoration record
- selected parts history
- final timing where appropriate
- authenticity/evidence caveats

Never expose:

- costs
- margins
- supplier notes
- private diagnosis
- internal reasoning
- private business records

## 15.5 Certificate

Generate branded Certificate of Authenticity / Service / Restoration as appropriate from verified published facts.

Include:

- certificate number
- Item identity
- relevant verified details
- date/service outcome
- QR back to the public Passport

Printable/PDF output comes from the same published data model.

---

# 16. Search, Tools, Commands and Voice

## 16.1 Universal search

Search may include:

- Items
- Work
- Parts
- donors
- movement Knowledge
- storage
- vendors
- ledger
- sales
- tools
- consumables

## 16.2 Tools drawer

One Tools surface rather than many pages.

Possible groups:

### Money
- Auction Max Bid
- Landed Cost
- Profit/Margin/ROI

### Watch
- units/lignes converter
- case/crystal converter
- timing comparison
- positional averages

### Bench
- measurement scratchpad
- timers
- camera
- Timegrapher

### Intelligence
- Movement Finder
- Parts/Donor Finder
- Knowledge Lookup
- Lubrication Lookup

### Physical
- QR generator
- Item/storage labels

## 16.3 Commands

Examples:

- Open Item
- Start/Pause/Resume Bench Session
- Find donor
- Add Part Need
- Move Item
- Open Timegrapher
- Add income/cost
- Open auction calculator

## 16.4 Voice

Voice is an input layer into existing commands/capture.

Examples:

- record a measurement
- add a Part Need
- capture a note
- mark step complete
- open timing
- show lubrication guidance
- pause session

Material permanent actions remain confirmable where appropriate.

---

# 17. Printing and Physical Workflow

After core acceptance, support:

- Item labels
- storage labels
- donor labels
- QR Passport labels
- repair reports
- certificates
- invoices/receipts where needed

If browser/Android printing cannot communicate reliably with workshop hardware, use a desktop Print Bridge rather than distorting the core application around printer limitations.

---

# 18. Build Plan — Locked Sequence

The sequence below is canonical unless this roadmap is explicitly amended.

## Phase 1 — Hardening and Simplification

**Goal:** make existing workshop state trustworthy before adding new capability.

Build/fix:

- prevent stage completion with required checks outstanding
- database-level guard against bypass
- repair existing inconsistent Work records
- make calculated Next Workshop Action authoritative everywhere
- retire manual competing next-action UI
- remove unrestricted stage-status dropdowns
- synchronise Workbench/Job/Bench state after changes
- silent in-place guided-check refresh
- reasoning stale detection
- merge duplicate QC into Final Verification + Release
- consolidate diagnosis around one graph/surface
- establish Test/Demo mode
- establish procedure-version foundation
- verify backup/restore and history safety
- acceptance tests for induction → plan → Work → verification → release

### Phase 1 acceptance gate

A real Work can progress end-to-end without:

- manual database intervention
- contradictory status
- stale Next Action
- empty required procedure stages
- bypassed required checks
- duplicated QC
- lost workshop evidence

Use Waltham/current real workshop examples as acceptance cases, while keeping demo data excluded from learning.

---

## Phase 2 — Bench UX 3.0

**Goal:** make Calibre excellent to use physically at the bench on phone and DeX.

Build:

- mobile Workbench redesign
- DeX Workbench refinement
- dedicated Work workspace
- Step Navigator
- phone Steps drawer
- DeX three-pane Work layout
- Start/Pause/Resume/Finish timer
- auto-resume on deliberate workshop action
- session segment persistence
- Resume Snapshot
- Unified Capture
- exact evidence-to-check links
- Bench/Component State
- controlled Reset Job
- current-action-first phone experience
- persistent Bench Live return control

### Phase 2 acceptance gate

Complete a real hands-on session on both phone and DeX without needing to hunt through a giant Job Card or manually recover context.

---

## Phase 3 — Workshop Intelligence

**Goal:** make procedures and technical guidance structured, sourced and reusable.

Build:

- Procedure Studio
- procedure versioning
- canonical watchmaking taxonomy
- Movement Intelligence content ingestion
- movement/source-backed procedural guidance
- lubrication maps
- compatibility network
- donor/part lineage
- Parts/Donor Finder
- Workshop Memory V1
- previous-repair retrieval
- check usefulness/outcome learning where evidence supports it

### Phase 3 acceptance gate

For a known movement/fault, Calibre can show sourced guidance, previous relevant workshop outcomes and compatible parts/donors without overstating certainty.

---

## Phase 4 — Business Intelligence

**Goal:** make the business model trustworthy enough to guide decisions.

Build:

- canonical money ledger completion
- income categories and owner-capital separation
- reversal/correction workflow
- full landed-cost model
- lot cost allocation
- Cash Profit vs Economic Profit
- ROI/margin/profit-hour
- stock ageing
- capital tied up
- potential-profit pipeline
- smarter workshop/business statistics
- monthly/YTD/custom reports
- repair-economics checkpoint
- stop-loss warnings
- acquisition/max-bid intelligence

### Phase 4 acceptance gate

A completed purchase-to-sale lifecycle reconciles from source transactions to realised profit, including bench time and allocated costs, without spreadsheet correction.

---

## Phase 5 — Public Calibre

**Goal:** expose a polished customer-safe catalogue without compromising internal data.

Build in this order:

1. publication/sanitisation layer
2. permanent public Item identity
3. catalogue
4. Item detail
5. QR Customer Passport
6. Certificate
7. enquiry
8. listing-output integration

Do not build checkout/customer accounts in initial release.

### Phase 5 acceptance gate

A public QR scan can open the correct sanitised Item Passport and certificate/catalogue data without any private cost, margin, supplier or diagnosis data leaking.

---

## Phase 6 — Operations and Scale

**Goal:** reduce repeated administration and make the system easier to operate as inventory/work volume grows.

Build:

- Attention Centre
- universal search completion
- command palette/actions
- receiving/incoming workflow
- labels/QR workflows
- desktop Print Bridge if required
- device profiles
- offline-safe capture queue
- multi-device/realtime state improvements
- internal health/data-quality checks
- advanced backup/recovery verification

### Phase 6 acceptance gate

Routine workshop/business exceptions surface automatically and the system remains reliable across phone/DeX and intermittent connectivity.

---

## Phase 7 — Advanced Calibre

**Goal:** add advanced AI/automation only after underlying state and evidence are trustworthy.

Build selectively:

- contextual Ask Calibre
- research execution/ingestion workflow
- voice commands
- proactive Work prioritisation
- advanced Workshop Memory analysis
- advanced acquisition intelligence
- verified listing generation
- selected safe automations

### Phase 7 acceptance gate

AI recommendations cite/trace real Calibre evidence and cannot silently overwrite canonical technical, financial or historical records.

---

# 19. Explicitly Deferred / Not Now

Do not allow these to distract from the locked sequence:

- customer accounts before catalogue/passport proves useful
- ecommerce checkout in Public V1
- separate Home dashboard
- standalone Ask Calibre page
- standalone Voice Assistant product
- standalone Movement/Parts/Donor Finder pages when contextual tools suffice
- dozens of utility/calculator pages
- unvalidated Timegrapher amplitude
- AI-generated technical certainty without evidence
- automatic material Job Plan changes without user approval
- unsourced movement-specific procedural claims

---

# 20. Roadmap Governance — No Drift Rule

This section is binding for future Calibre work.

## 20.1 One roadmap

This file is the only roadmap.

Do not create:

- alternate master plans
- competing phase lists
- separate product roadmaps
- ad-hoc “new direction” documents

Supporting architecture/runbook documents may exist, but they are subordinate implementation references.

## 20.2 New ideas

When a new idea appears:

1. place it into the existing appropriate phase if it supports the locked architecture;
2. mark it **Deferred** if valuable but not timely; or
3. explicitly amend this roadmap if it materially changes product architecture or sequence.

Do not silently reorder the roadmap during implementation.

## 20.3 Phase discipline

A later phase may receive preparatory schema work when technically necessary, but it must not become the active product focus before earlier acceptance gates are satisfied unless this roadmap is explicitly amended.

## 20.4 Removal discipline

When a newer canonical function replaces an older one, retire the older function rather than preserving two competing interfaces “just in case”.

## 20.5 Acceptance over feature count

A feature is not complete because it renders.

Important paths require appropriate verification such as:

- persistence: save → refresh → confirm
- database integrity
- phone behaviour
- DeX/desktop behaviour
- audit/history behaviour
- security/RLS where applicable
- real workflow acceptance

---

# 21. Immediate Next Work

The active focus is **Phase 1 — Hardening and Simplification**.

Do not begin another major feature stream until the workshop state issues already identified are addressed, particularly:

1. stage-completion integrity
2. authoritative Next Workshop Action
3. Workbench/Bench state synchronisation
4. guided-check silent refresh
5. reasoning staleness
6. duplicate QC removal
7. diagnosis consolidation
8. Test/Demo isolation
9. procedure-version foundation

After Phase 1 acceptance, proceed directly to **Phase 2 — Bench UX 3.0**.

---

# 22. Final Operating Principle

> **Calibre notices. Evidence supports. Calibre recommends. The watchmaker decides. The outcome becomes knowledge.**

And the architectural rule beneath it:

> **One fact, one canonical owner. Many views.**

This document remains the source of truth until deliberately amended.