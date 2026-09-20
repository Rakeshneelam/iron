# Firebase — retired from the app, not yet retired from the internet

Iron no longer has accounts. `src/services/account.ts` and `src/services/firebase.ts`
are deleted, the `firebase` package is out of `package.json`, and the sign-in
screens are redirects to the local profile editor (UX-12 — the app's own
requirement is "no backend, no accounts", AGENTS.md §1).

`firestore.rules` and `firebase.json` are kept on purpose. They describe a project
that may still be deployed, holding profile documents for anyone who made an
account in 0.4.0 or earlier. Deleting the rules would not delete those records; it
would only lose the description of what is protecting them.

Retiring the project — deleting the user documents, then the project itself — is
external, destructive, and separate work. Until someone does it, these two files
are the record of what is out there.
