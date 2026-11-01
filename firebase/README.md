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

## Hosting: the three public pages

`site/` holds the home page, privacy policy and terms of service that Google's
sign-in screen links to, served free by Firebase Hosting at
https://iron-508406.firebaseapp.com (`/`, `/privacy`, `/terms`). Deploy with:

    npx firebase-tools deploy --only hosting --project iron-508406

`--only hosting` leaves the Firestore rules above untouched.

Showing a logo on the sign-in screen needs Google's branding verification: the home
page must name the app, explain it and link the privacy policy, and the domain must
be verified in Search Console (drop Google's `google….html` file into `site/` and
deploy again). Without a logo, publishing needs no verification.
