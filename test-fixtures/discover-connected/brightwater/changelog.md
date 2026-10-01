# Brightwater Message Bus: Changelog

## 4.2.0

- The default retention for unacknowledged messages is raised from 7 days to 14 days.
- FIFO ordering within message groups is now generally available.
- The legacy v1 HTTP API has been removed. Use the v2 API.

## 4.1.0

- Dead-letter queue redrive is available from the console.
- Added the `x-bw-attempt-count` header to HTTPS deliveries.
- Namespaces can now be created in two additional zones.

## 4.0.0

- OAuth 2.0 client credentials replace shared secrets for authentication.
- AMQP 1.0 support is generally available.
