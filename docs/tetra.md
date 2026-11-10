# Tetra, accounts and permissions

Dashboard manages only the server it runs on, through the local Tetra agent.
It talks to Tetra over the Unix socket `/run/tetra/tetra.sock`
(`TETRA_SOCKET_PATH` changes it), and Tetra identifies it by the socket's peer
UID, so there is nothing to enroll. On a server that UID belongs to the
`ultramarine-dashboard` account the Quadlet runs the container as (see
[container image](container-image.md)).

## Accounts and permissions

Accounts are the server's system accounts. Tetra checks the password (PAM),
then a TOTP or recovery code if the account has one, or a passkey, and issues a
session token. Dashboard keeps the token in an httpOnly cookie and sends it with
every call. It never decides who someone is.

Tetra authorizes every action. Dashboard only hides the pages Tetra says the
user can't see (`session.info`) and answers 403 for them. Routes Dashboard
doesn't map to a Tetra page need an administrator, so a new page is never
open by accident. Passwords are changed on the console or over SSH, not in
Dashboard, and first-time setup happens in the server OOBE.

## The mock

`TETRA_MOCK=1` replaces the socket with an in-memory Tetra that follows the
session protocol (pending logins, single-use codes, token lifetimes,
permissions). It doesn't verify passkey signatures, so only the dev server
accepts it and a production build refuses to start while it's set. Its accounts
are listed in [development](development.md#mock-tetra).
