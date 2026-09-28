# Pilot service templates

## source-check-v1 / 1.0.0
Check 1–20 atomic technical claims against a specified version/date scope and source/search policy. Return one row per claim with supported, contradicted, or unresolved status, evidence references, explanation, and effort log. Deliver source evidence in model-readable text plus machine-readable JSON. Do not infer contradictions from mere absence. Do not pay for the number of errors found.

## evidence-pack-v1 / 1.0.0
Fill a fixed entity × field grid, at most 50 cells, using a specified public-source/search policy. Return a value with supporting evidence, conflicting alternatives with provenance, or an honestly unresolved cell. No invented defaults and no silent version substitution. Missing values remain null.

Both templates require precommitted boundaries, authentic provenance when available, and inspection of the actual evidence. A stored hash detects changes to the same bytes; it does not prove who published them. LLM agreement alone does not establish source authenticity. If independent retrieval/authentication is unavailable, scope the service as comparison against the buyer-supplied corpus, not certification of the public web.

These are draft service specifications, not advertisements of staffed services. No supplier, price, delivery SLA, or availability is promised.

The executable v1 schemas require exact approved HTTPS source URLs (no wildcard expansion). Result source URLs must belong to that list. This is a structural scope check, not publisher authentication.
