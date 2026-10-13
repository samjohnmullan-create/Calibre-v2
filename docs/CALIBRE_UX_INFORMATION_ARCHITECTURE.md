# Calibre UX / Information Architecture

## Product principle
Calibre should feel like one operating system for the business, not a collection of feature pages. Top-level navigation answers **where am I working?**, while specialist functions appear inside the workflow where they are needed.

## Primary areas
1. **Home** — what needs attention now?
2. **Intake** — what has just entered Calibre and still needs to be understood/reviewed?
3. **Inventory** — what do we own, stock or hold?
4. **Workbench** — what work is active, blocked, ready or in QC?
5. **Business** — what is it costing, earning and tying up in capital?

A secondary **Library** area contains reusable technical knowledge. Research remains an action available from Items and Work rather than a disconnected daily workspace.

---

## Home
Home is the operating dashboard, not a placeholder.

Show:
- On Bench / Ready / Waiting / QC counts
- Intake items needing review
- Items ready to list
- unresolved blockers
- recent activity
- useful business snapshot (invested stock value, potential profit, realised sales)

Primary pattern: **Needs attention** cards with direct actions.

---

## Intake
Intake is the boundary between messy incoming information and structured Calibre records.

Views:
- Inbox
- Invoices
- Purchases
- Completed

Inputs can later include:
- invoice / receipt upload
- auction purchase
- email purchase
- manual item capture
- photos of acquisitions
- incoming parts / parcels
- bulk lots

Workflow:
**Capture → Understand → Review → Create records**

Completed intake records leave the active queue but remain permanently accessible.

---

## Inventory
Inventory should not use navigation tabs for every data attribute.

Primary views:
- **Items**
- **Parts**
- **Workshop** (tools, consumables, oils, equipment, storage)

Items use filters rather than top-level tabs:
- Type: Watch / Clock / Jewellery / Accessory / future types
- Purpose: Resale / Collection / Repair / Donor / Client / Reference
- Status: Acquired / Researching / Preparing / Ready for sale / Listed / Sold / etc.

Files are not an inventory type. Documents remain attached to the records they belong to and can later have a global file search if needed.

---

## Item workspace
The Item is the permanent physical-object root.

Header:
- Item number
- title
- type / purpose / lifecycle status
- quick actions: Start Work, Research, Add photo, Value, List

Default tab: **Overview**

Recommended tabs:
- Overview
- Details
- Work
- Research
- Sale
- History

### Overview
At-a-glance identity, technical summary, condition, current lifecycle position, economics, work state and media.

### Details
Merge the current user-facing concepts of Item + Passport into one understandable record while keeping the database schemas separate.

Sections can include:
- Identity
- Watch Passport / technical specification
- Measurements
- Markings
- Attributes
- Media

The UI should not force the user to understand whether a field technically lives in `item_identity`, `passports` or `item_facts`.

### Work
All Work records for the Item, with the active Job Card foregrounded.

### Research
Research requests/findings and movement identification directly in Item context.

### Sale
Valuation, costs, listing state, offers, sale and profitability.

### History
Permanent timeline across acquisition, changes, Work, research, listing and sale.

---

## Workbench
Keep the workflow model:
**Queue → Ready → On Bench → Waiting → QC → Complete**

Workbench is a queue-management surface, not the place for duplicated job editing.

Cards show:
- Item / Work number
- current state
- next action
- blocker where applicable
- priority

Opening a Work card should open the Job Card directly.

Useful filters:
- All
- On Bench
- Waiting
- Ready
- QC

---

## Job Card
The Job Card is the workshop operating record.

It contains:
- diagnosis
- next action
- checklist
- measurements
- timing
- parts needed / used
- notes / history
- QC
- completion summary

### Parts matching belongs here
The user should not have to select the Work again in a separate Parts Desk.

From the Job Card:
1. Add part need
2. Calibre checks owned parts, donors and compatibility knowledge
3. Show ranked evidence-backed candidates
4. Reserve
5. Record bench fit evidence
6. Consume part
7. Fulfil need and clear blocker

The standalone Parts Desk workflow should eventually be removed.

---

## Research / Library
### Research
Research is an action from an Item or Work context.

Movement Finder and Movement Search should become one research experience:
- direct search when identity is known
- guided identification when identity is unknown

Search inputs can include maker, calibre, markings, dimensions, jewels, beat rate, movement type and photos.

### Library
Reusable technical knowledge:
- movements
- part references
- compatibility
- technical documents
- sources
- Calibre Verified evidence

Knowledge Engine import / update is an administrative function and should move to Settings rather than dominate the daily Library page.

### Compatibility intelligence
Compatibility should surface contextually:
- Item Passport: compatible donors owned
- Job Card: part candidates
- Donor Item: Items it may support
- Part record: known applications

It should not require the user to remember to visit a separate compatibility page.

---

## Business
Business becomes the financial and sales operating area.

Recommended views:
- Overview
- Stock Value
- Sales
- Costs
- Listings

Show:
- stock at cost
- target value
- potential gross/net profit
- realised sales
- monthly P&L
- capital tied up
- most profitable Items
- dead stock
- ready-to-list stock
- aged stock
- tool/equipment spend vs stock investment

---

## Navigation shell
### Desktop / DeX
Prefer a compact left rail plus a narrow top utility bar.

Primary rail:
- Home
- Intake
- Inventory
- Workbench
- Business

Secondary:
- Library
- Settings

Top utility bar:
- global search
- + New
- user/profile

This uses wide-screen space efficiently and preserves vertical height.

### Phone
Do not merely shrink desktop.

Use bottom navigation for frequent destinations:
- Home
- Items
- Work
- More

A prominent **+ New** opens one creation sheet.

---

## Universal creation
One creation system across the app:
- Item
- Invoice / Purchase
- Part
- Work
- Photo
- Cost

Remove competing Add Item implementations.

---

## Global search
One search should eventually cover:
- Item number
- maker/model
- calibre
- reference/serial
- part reference
- Work number
- invoices/vendors
- notes
- knowledge records

Results grouped by entity type.

---

## Context drawer
Desktop: right-hand context drawer.
Phone: bottom sheet.

Use it for quick inspection of:
- part
- donor Item
- invoice
- movement
- source document
- related record

This reduces page switching while preserving a full-record option.

---

## Implementation sequence
1. **Consolidate application shell and routing** — one mounted app, no parallel route components or document-level click interception.
2. **Create new responsive navigation shell** — desktop/DeX side rail, phone bottom nav, top utility bar.
3. **Build Home operating dashboard.**
4. **Create Intake and move invoice processing there.**
5. **Simplify Inventory** to Items / Parts / Workshop with filters.
6. **Rebuild Item workspace** around Overview / Details / Work / Research / Sale / History.
7. **Move parts matching fully into Job Card** and retire standalone Parts Desk.
8. **Merge movement search/finder** into one Research experience.
9. **Move Knowledge Engine admin/import** to Settings.
10. **Add global search, universal + New, context drawer.**

---

## Guardrail for future features
Before adding a new top-level page, ask:

> Is this genuinely a new place where the business works, or is it a function that belongs inside Home, Intake, Inventory, Workbench, Business, Library or Settings?

Default to contextual integration. Avoid growing a menu of feature names.
