# Confirmed movement evidence promotion

Calibre may promote a Library document from one Item / Work context into reusable movement knowledge only when all of the following are true:

- the Passport movement identification status is `confirmed`;
- the Passport is explicitly linked to a `knowledge_movements` record;
- the Library document has at least one page-level finding reviewed as `accepted`;
- the watchmaker explicitly chooses **Link to confirmed movement**.

The action links the document to the confirmed movement and records a `movement_reference` document link. It never overwrites a document already linked to a different movement, does not change Passport fields, and does not turn a reviewed source fact into a workshop diagnosis automatically.
