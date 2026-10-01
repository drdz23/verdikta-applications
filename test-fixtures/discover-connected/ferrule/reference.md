# Ferrule Identity SDK 6.0: Reference

Ferrule Identity SDK handles sign-in, token issuance and session management for web and mobile applications. This page describes release 6.0. See [Security](security.md) for password, factor and cookie settings.

## Requirements

The SDK requires **Node.js 18 or later** and TLS 1.2 or later for every connection to the identity service.

## Tokens

Access tokens expire after **15 minutes** by default. The lifetime can be set between 5 and 60 minutes in the application settings.

Refresh tokens **rotate on every use**. Each refresh returns a new refresh token and invalidates the previous one. Presenting an already-used refresh token revokes the whole session.

## Grants and PKCE

Authorization code flow with **PKCE is required for all public clients**. Confidential clients may use PKCE but are not required to. The implicit grant was removed in release 6.0; applications that still depend on it must migrate to the authorization code flow.

## Key discovery

The SDK downloads the signing keys (JWKS) from the identity service and caches them for 1 hour. A token signed with an unknown key id triggers one forced refresh of the cache.

## Related pages

- [Security](security.md)
