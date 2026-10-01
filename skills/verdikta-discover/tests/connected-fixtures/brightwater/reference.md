# Brightwater Message Bus 4.2: Reference

Brightwater Message Bus is a managed message queue for service-to-service messaging. This page describes the behaviour of release 4.2. For hard limits see [Limits](limits.md); for release history see the [Changelog](changelog.md).

## Delivery semantics

Brightwater delivers messages **at least once**. A message that is not acknowledged before its visibility timeout expires is delivered again, so consumers must be idempotent. Exactly-once delivery is not offered.

Ordering is guaranteed only **within a message group**. Messages that share a group ID are delivered in the order they were published. There is no ordering guarantee between groups, or between queues in the same namespace.

## Message size

The maximum message body size is **256 KB**. Larger payloads should be stored elsewhere and referenced by URL.

## Dead-letter queues

Each queue can have a dead-letter queue. By default a message moves to the dead-letter queue after **5** failed delivery attempts. The threshold is configurable between 1 and 20 attempts.

## Visibility timeout

The default visibility timeout is 30 seconds. A consumer can extend it on each receive call, up to **24 hours**.

## Protocols and authentication

Clients connect over AMQP 1.0 or HTTPS. Authentication uses OAuth 2.0 client credentials. API keys are not supported; a request without a bearer token is rejected with HTTP 401.

## Encryption

Messages are encrypted at rest with AES-256-GCM by default, and in transit with TLS 1.2 or later.

## Related pages

- [Limits](limits.md)
- [Changelog](changelog.md)
