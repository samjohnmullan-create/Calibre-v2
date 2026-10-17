# Research → Library pipeline

Calibre Research treats discovered documents as evidence candidates rather than automatically trusted knowledge.

## Current flow

1. Research runs against an Item or Work record.
2. Structured findings remain reviewable before permanent Passport changes.
3. Technical documents returned in `requested_scope.domain_ingestion.technical_documents` are surfaced in the Research Outcome.
4. A user can open the original source and explicitly **Save to Library**.
5. Saving creates or reuses a `knowledge_technical_documents` reference and links it through `knowledge_document_links` to the Item, Work and Research Request, including page range and relevance text where available.
6. External files are not copied automatically. This keeps evidence provenance clear and avoids silently archiving material the user did not choose to store.

## Next slices

- Inspect/read supported PDFs and extract page-level findings.
- Offer explicit **Archive copy** for documents the user wants stored in Calibre.
- Link saved documents to movement records once movement identity is confirmed.
- Surface relevant Library pages contextually inside Bench Mode.
- Add document/finding deduplication and stronger source-quality grading.
