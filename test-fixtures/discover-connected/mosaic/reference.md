# Mosaic Index 2026.2: Reference

Mosaic Index is a hosted full-text search service. This page describes release 2026.2. Release history is in the [release notes](release-notes.md).

## Query limits

A query returns at most **1,000 results**. To read further, narrow the query or use a different sort order.

A query string can be up to **2,048 characters** long. Longer strings are rejected with HTTP 414.

## Matching

Fuzzy matching supports an edit distance of up to **2**. Distances above 2 are not accepted and the request fails with a validation error.

## Pagination

Results are paginated with opaque cursors. A cursor expires **10 minutes** after it is issued. Request the first page again if the cursor has expired.

## Indexing latency

New and updated documents become searchable within **5 seconds** at the 95th percentile. Bulk imports of more than 10,000 documents can take longer.

## Related pages

- [Release notes](release-notes.md)
