# Mosaic Index: Release notes

## 2026.2

- Fuzzy matching now accepts an edit distance of up to 2 (previously 1).
- Pagination cursors now expire after **15 minutes** (previously 5 minutes).
- Bulk import throughput is roughly doubled.

## 2026.1

- The query string limit is raised from 1,024 to 2,048 characters.
- Added the `sort` parameter to the search endpoint.
- Fixed an issue where some updated documents were returned twice in a single result page.

## 2025.4

- Search endpoints are available from two additional hosting zones.
