# Init Delivery Roadmap

Status: planning complete; implementation focus is signup and signin.
Date: 2026-10-12

## Goal

Deliver a trustworthy first-run experience in which a new user can sign up,
sign in, use the dashboard as an owner-scoped user, and sign out. No datafeed
capability is considered production-ready until this identity gate passes.

## Identity decisions

These decisions are closed for init delivery:

- Casdoor is the identity provider and the dashboard uses Auth.js OIDC.
- Signup is hosted by Casdoor; the dashboard does not duplicate password or
  account-management forms.
- Casdoor application: `endpointer-dashboard` in the `endpointer`
  organization.
- `session.user.id` is the stable OIDC `sub` claim and is the owner key.
- `session.user.username` comes from Casdoor's immutable `name` claim and is
  the public URL segment.
- Dashboard authorization is deny-by-default when either claim is missing.
- Email verification, phone OTP, and MFA are post-init work tracked by issue
  #16. They are not blockers for local signup/signin verification, but are
  production identity requirements before accepting sensitive customer data.
- Profile edits remain on Casdoor's account page for init; issue #20 owns any
  future dashboard profile editing.

## Delivery gates

### Gate 0: Environment readiness

- [ ] Fresh Docker startup creates Casdoor and its database.
- [ ] The dashboard has valid `AUTH_CASDOOR_ISSUER`, client ID, client
      secret, and `AUTH_URL` values.
- [ ] Casdoor's redirect URI and post-logout URI match the dashboard origin.
- [ ] A repeatable local test account strategy exists; tests do not commit
      credentials.
- [ ] Default Casdoor admin credentials are removed or changed before any
      non-local deployment.

Owner: #15, #19.

### Gate 1: Signup

- [ ] A new user can create a unique username and email with matching
      passwords.
- [ ] Duplicate username and duplicate email are rejected without creating a
      partial account.
- [ ] Invalid or incomplete signup input is shown by Casdoor.
- [ ] The new user can return to the dashboard signin flow.

Owner: #15.

### Gate 2: Signin and session

- [ ] `/login` preserves a safe `callbackUrl` and starts Casdoor OIDC.
- [ ] Successful signin returns to the requested dashboard page.
- [ ] `session.user.id` equals the stable OIDC subject.
- [ ] `session.user.username` is present and matches the Casdoor username.
- [ ] Missing identity claims cannot access protected pages or manager calls.
- [ ] Two users with the same datafeed or endpoint name remain isolated.

Owner: #15 and the existing owner-scoping work in #10/#12.

### Gate 3: Signout and regression coverage

- [ ] Auth.js session is cleared.
- [ ] Casdoor SSO session is cleared.
- [ ] A protected-page visit after signout returns to signin.
- [ ] Playwright covers signup, signin, callback redirect, protected-route
      redirect, session claims, and signout.
- [ ] The flow is verified against a fresh local stack, not only mocked tests.

Owner: #23.

### Gate 4: Production identity readiness

- [ ] FeedHub Admin branding replaces Casdoor defaults.
- [ ] Secrets are externalized and the default admin password is changed.
- [ ] Production callback and logout URLs are documented and tested.
- [ ] Email verification, phone verification, and MFA policy are approved.

Owner: #15, #16, and #19.

## Work order

1. Complete Gate 0 and record the environment values without committing
   secrets.
2. Run and document the real signup flow.
3. Run and document signin, callback, session claim, protected-route, and
   signout behavior.
4. Add the focused Playwright regression suite from #23.
5. Fix only defects found in those flows.
6. Close #15 and #23 only after Gates 1-3 pass.
7. Start email verification/MFA (#16), production security (#19), and then
   datafeed production work.

## Known loose ends before implementation

- The current auth code is configured for OIDC, but the browser round trip is
  not yet verified in this workspace.
- The current login route returns raw error text with HTTP 401; the desired
  user-facing error treatment should be decided during #15.
- The dashboard README still describes authentication as a non-goal and must
  be corrected as part of the auth acceptance work.
- The local Casdoor `init_data.json` is generated/ignored, so the tested
  application and signup settings must be reproducible from documented setup.
- Email verification and MFA are intentionally deferred, not forgotten; they
  remain a production prerequisite tracked by #16.

## Definition of ready for the next implementation session

The next session may implement only #15 or #23 after Gate 0 values and the
browser test-account strategy are recorded. It must begin by reading this
roadmap and the issue checklist, then run the narrowest browser check before
changing auth code.
