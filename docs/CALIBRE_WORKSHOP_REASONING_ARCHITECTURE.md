# Calibre Workshop Reasoning Architecture

Status: locked product architecture for Workshop / Diagnosis / Guided Work.

## Principle

Calibre is not a checklist app and it does not replace the watchmaker. It maintains a live, evidence-backed understanding of a Work record and recommends the next most useful action.

**Observed reality -> hypotheses -> discriminating checks -> evidence -> conclusion -> action -> revised job state.**

OpenAI may interpret, rank, explain and propose. It does not silently create canonical facts, confirm diagnoses, consume parts, change valuations, close Work, or rewrite Job Plans.

## Canonical workshop objects

- **Item** — permanent physical watch/item identity.
- **Work** — one repair/service/restoration attempt.
- **Job Plan** — versioned intention for that Work.
- **Procedure modules** — reusable stages assembled according to the current Job Plan.
- **Step checks** — guided observations/actions beneath a procedure stage.
- **Finding** — something actually observed.
- **Hypothesis** — a possible mechanical explanation; never treated as fact until evidence supports it.
- **Diagnostic check** — a discriminating bench action that can support, weaken, confirm or rule out hypotheses.
- **Evidence** — observations, photos, measurements, timing, technical references, parts fit evidence and workshop history.
- **Knowledge** — sourced movement/parts/procedure information from Calibre Knowledge, the user's Drive library and workshop history.
- **Research** — fills knowledge gaps; results require provenance and confidence.
- **Parts graph** — compatibility and donor evidence, including successful and failed fits.
- **Timing** — a diagnostic sensor and QC record, not a separate utility.
- **Next Best Action** — one recommended action derived from current state and unresolved evidence.
- **Workshop Memory** — resolved symptom -> checks -> confirmed cause -> repair -> result history.

## Branching procedure model

Step checks can be typed questions or tools. A result may activate child checks, suppress irrelevant checks, create a Finding, change the diagnostic graph, or propose a Job Plan revision.

Example:

1. Check magnetism.
2. `clear` -> demagnetising branch is inactive.
3. `detected` -> activate demagnetise -> re-check -> compare timing.
4. Result becomes evidence attached to the Work.

Inactive branches are retained for audit but are not counted as outstanding work.

The UI should progressively disclose only the relevant branch. Completed/ruled-out branches may be collapsed under history.

## Diagnostic graph

Diagnosis is a graph, not a single tree. Multiple findings may support the same hypothesis, and one check may affect several hypotheses.

Evidence effects:

- `supports`
- `weakens`
- `rules_out`
- `confirms`
- `neutral`

Display qualitative support rather than invented numeric probabilities until Calibre has enough resolved workshop data for calibration:

- Strongly supported
- Supported
- Possible
- Weak
- Ruled out
- Confirmed

Every recommendation must be explainable with **Why?** showing supporting, contradicting and missing evidence.

## Next Best Action

Calibre should always attempt to answer one question: **What should I do next?**

Deterministic priority initially:

1. unresolved approved/suggested diagnostic check that best narrows an open fault;
2. active required child check in the current procedure stage;
3. due timing/measurement/photo/part tool action;
4. unresolved blocker/part requirement;
5. next procedure stage;
6. final QC/readiness.

OpenAI may later re-rank candidate diagnostic checks, but must return structured reasoning and cannot bypass hard workflow gates.

## Job Plan revisions

The initial Job Plan is never silently overwritten. Material discoveries create a proposed revision with the triggering Finding/evidence and the proposed add/remove/reorder action. The watchmaker accepts or rejects it. Accepted plans retain prior revisions.

Example: `Full service` -> finding `broken fourth-wheel pivot` -> proposal `Add repair fault + part search` -> accepted Job Plan revision.

## Inline tools

When a tool is due, bring the tool to the current action rather than forcing navigation.

- timing check -> embedded Timegrapher + **Save results**;
- measurement -> inline measurement entry;
- photo -> inline capture/upload;
- part requirement -> inline Part Need + stock/donor search;
- knowledge -> relevant sourced technical evidence;
- research -> targeted request scoped to the current problem.

Saving tool evidence should satisfy/link the current check where appropriate and immediately recalculate the job state.

## Timing checkpoints

Timing is expected at:

- baseline / pre-service;
- post-reassembly;
- regulation;
- final QC.

A saved timing run becomes diagnostic evidence and can create/re-rank findings such as excessive beat error, instability or large positional spread.

## Knowledge source order

1. user's Google Drive watchmaking books/manuals;
2. Calibre Knowledge;
3. existing Workshop Memory / prior verified fits and repairs;
4. targeted live web research.

Every externally derived technical claim keeps source/provenance and confidence.

## OpenAI role

OpenAI runs server-side only. Suitable tasks:

- structure free-form observations;
- rank remaining hypotheses;
- choose a high-information next diagnostic check;
- explain why a check matters;
- summarise sourced manuals/research;
- generate targeted research queries;
- compare new evidence against current state;
- propose Job Plan changes.

OpenAI outputs proposals/reasoning. Canonical changes use explicit audited Calibre mutations.

## UI model

### Phone

Current action first. Diagnostic branch directly below. Evidence/tools in a compact drawer. Keep one obvious primary action.

### DeX / desktop

- **Navigator:** procedure / diagnosis / QC progress.
- **Current Action:** the active question, instruction or inline tool.
- **Calibre Intelligence:** hypotheses, evidence, Knowledge, research changes, parts candidates.

The interface should answer at a glance: **where am I, what do I do now, why, and what happens next?**

## Non-negotiable safety/data rules

- Findings are facts/observations; hypotheses are not facts.
- Suggestions never become confirmed diagnoses without evidence/watchmaker confirmation.
- Inactive branches remain auditable.
- Job Plan history is preserved.
- Timing/finance calculations remain deterministic.
- AI keys never ship to the browser.
- Database/RLS remains authoritative.
- All meaningful recommendations are explainable and source-aware.
