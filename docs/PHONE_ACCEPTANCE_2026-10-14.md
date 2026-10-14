# Galaxy phone acceptance — 14 October 2026

Evidence supplied from the live GitHub Pages build identified the following acceptance regressions:

- mobile utility Search control wrapped `Search Calibre` outside its button;
- fixed bottom navigation obscured route content;
- Home and Workbench summary cards became oversized single-column stacks;
- Workbench view tabs clipped at the viewport edge;
- Inventory could appear as an empty background after route navigation because scroll position was preserved;
- Item workspace tabs and cards remained too large for the phone viewport;
- an older screenshot showed `work_number` identity insertion failure while starting Work. The current live `start_work` RPC was re-tested transactionally on 14 October 2026 and correctly generated the Work identity and checklist, so no database mutation was made for that historical screenshot.

The `mobile-acceptance-v2.css` layer and shell navigation reset are the targeted acceptance response. Phone acceptance remains open until rechecked on the physical Galaxy device.
