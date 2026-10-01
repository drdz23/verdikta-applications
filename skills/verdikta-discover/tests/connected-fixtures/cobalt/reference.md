# Cobalt Ledger Store 2.7: Reference

Cobalt Ledger Store is an object store with an append-only audit ledger. This page describes release 2.7. See [Limits](limits.md) for quotas and the [FAQ](faq.md) for common questions.

## Consistency

New objects are readable immediately after a successful PUT (read-after-write consistency). Overwrites and deletes are eventually consistent: a read issued right after an overwrite can return the previous version for a short time.

## Uploads

A single PUT request can upload an object of up to **5 GB**. Larger objects must use multipart upload. Each part except the last must be at least **5 MB**, and one upload can have at most 10,000 parts.

## Versioning

When versioning is enabled on a bucket, deleted objects are kept as recoverable versions for **30 days**. After that window the versions are purged.

## Authentication

Requests are signed with HMAC-SHA256 using a v4-style signature. An unsigned request is rejected with HTTP 403.

## Throttling

When a client exceeds its request quota the service responds with **HTTP 503** and a `Retry-After` header. Clients should back off and retry after the indicated delay.

## Encryption

All objects are encrypted at rest with AES-256. Customer-managed keys are supported through the key service.
