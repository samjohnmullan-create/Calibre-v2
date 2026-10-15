# Bench Guided Job Rollout

This programme turns Bench Mode into the complete Work execution surface.

## Product direction

Canonical flow:

**Induction -> Findings / Diagnosis -> Job Plan -> Guided Work -> Reassembly -> Timing -> Regulation -> Final QC -> Complete Work**

Bench Mode should keep the watchmaker inside one job context while exposing the tools required by each step.

## Research source hierarchy

Research and diagnostic enrichment should use sources in this order:

1. **Connected Google Drive watchmaking library** — owned books, course material, movement manuals, technical PDFs and reference documents.
2. **Calibre Knowledge** — accepted movement records, technical documents, part applications, compatibility evidence and prior research.
3. **Live web** — manufacturer documents, movement manuals, parts references, compatibility evidence, donor clues and current market/sales evidence that are missing or newer.
4. **Workshop history** — previous Calibre findings, confirmed diagnoses, successful/failed part fits, timing outcomes and completed repairs.

The browser application records the research request and its Work context. Connected-source and live-web research is performed by the research/assistant workflow, not silently fabricated by the client.

## Slice A - Bench job hub

- Keep Workshop Induction and multi-select Job Plan as the entry path.
- Add persistent Request Research inside Bench Mode and the Job Card.
- Research requests snapshot current Item, Work, Passport, findings, part needs, timing context and selected scope.
- Add a Diagnosis panel driven by Work findings.
- Possible causes remain hypotheses until explicitly confirmed.
- Allow hypotheses to be confirmed, ruled out or left open.
- Surface recommended next checks without silently changing the job plan.
- Add embedded timing access from Bench Mode and preserve the standalone Timegrapher route.

## Slice B - Typed procedure steps

Add procedure step types such as instruction, inspection, decision, photo, measurement, timing, part, repair and QC. Timing steps invoke the embedded Timegrapher in context. Measurement and evidence steps invoke their matching bench tools.

## Slice C - Dynamic diagnostic branching

A new finding can create suggested checks. Approved checks may be inserted into the active Work as diagnostic steps. The watchmaker remains in control of permanent Work mutations.

## Slice D - Research ingestion

Research completion should be able to propose updates for:

- Item identity and Passport facts
- movement Knowledge and technical documents
- part applications / compatibility evidence
- donor candidates
- fault-specific references
- market comparables and valuation suggestions

Important canonical changes remain reviewable and auditable.

## Slice E - Timing intelligence

Embed Timegrapher fully into Work with canonical checkpoints:

- pre-service
- post-reassembly
- regulation
- final QC

Add lift-angle provenance, guided positions, pre/post comparisons and timing-driven exceptions.

## Acceptance rule

A real watch must be able to remain inside Bench Mode from induction through signed Final QC without requiring navigation to a separate utility for normal workshop work.
