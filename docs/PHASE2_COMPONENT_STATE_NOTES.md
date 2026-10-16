# Phase 2 — Component / Tray State

Canonical current physical state is stored in `work_component_states` with one row per Work + component key.

The Work workspace records state, tray/location and notes for standard or custom components. Resume Snapshot reads the same canonical rows and highlights components that are removed, open, disassembled, cleaning, stored or otherwise not back in an installed/reassembled state.

Changes are also written to `work_events` as history; the event log is not the source of current physical state.
