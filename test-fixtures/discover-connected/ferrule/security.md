# Ferrule Identity SDK 6.0: Security settings

## Passwords

Passwords are hashed with **Argon2id**. The default memory cost is 64 MiB with three iterations. Hashing parameters can be raised in the application settings; they cannot be lowered below the defaults.

## Multi-factor authentication

Two factor types are available: time-based one-time passwords (TOTP) and WebAuthn security keys. SMS codes are **not supported** because of SIM-swap risk. Recovery codes are generated when a user enrols their first factor.

## Sessions

Session cookies are issued with `SameSite=Lax`, `Secure` and `HttpOnly` set by default. Cross-site request forgery protection is enabled by default for cookie-based sessions. Idle sessions end after 30 minutes unless the application configures a longer limit.

## Account lockout

After 10 consecutive failed sign-in attempts an account is locked for 15 minutes. Administrators can unlock an account earlier from the console.

## Related pages

- [Reference](reference.md)
