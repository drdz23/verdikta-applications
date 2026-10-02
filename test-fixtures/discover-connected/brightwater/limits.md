# Brightwater Message Bus 4.2: Limits

Limits that apply to namespaces running release 4.2. Default values apply unless a row says otherwise.

| Limit | Value |
|---|---|
| Maximum message body size | 128 KB (larger bodies are rejected with HTTP 413) |
| Retention of unacknowledged messages | 14 days by default; configurable from 1 hour to 14 days |
| Queues per namespace | 500 |
| Publish rate | 3,000 requests per second per queue |
| Maximum visibility timeout | 12 hours |
| Message groups per queue | 20,000 |
| Attributes per message | 20 |

## Requesting increases

Queue-count and rate limits can be raised through the console under **Namespace settings > Limits**. Requests are reviewed within two business days. The message body size and visibility timeout limits cannot be raised.

## Related pages

- [Reference](reference.md)
- [Changelog](changelog.md)
