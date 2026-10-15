# Team Powers Celebrations rollout

## What is implemented

The separate celebration experience is in `src/celebrations`. It runs at `/celebrations` on the existing host and becomes the root experience when this build is served at `celebrations.powerspizza.com`. This keeps a separate site experience while sharing the existing deployment and Supabase directory. No duplicate employee directory is created.

- Active `manager`, `supervisor`, and `admin` profiles can enter. GM and AM currently map to the existing `manager` role; AM users must be assigned that role in Team access. Accounting/employee roles do not receive access.
- Submissions are limited server-side to a user's primary or assigned stores; admins can submit for all stores.
- Managers can track their own submissions. Supervisors can read submissions for assigned stores. All eligible leaders can see approved, unexpired celebrations company-wide.
- Only the active admin profile with `daustin@powerspizza.com` can approve, decline, remove, redesign captions, and create/revoke TV keys. Other admin accounts can submit and view the live feed and their own history.
- Five font stacks, text size, color, alignment, backing, width and position are supported. Drag, keyboard arrows and sliders position the text. Saving creates an immutable 1920×1080 PNG. Caption overflow blocks saving rather than silently clipping text.
- Database triggers start 30 days at approval, prevent publication transitions from being forged, and preserve the timer during caption/design edits.
- Photos remain private. TV keys are stored only as SHA-256 hashes. The read-only Edge Function checks key validity and approval/expiry for every feed and image request.
- Media RSS sends one PNG per item, image file size, revision GUID and `duration="10"`. JSON and browser TV views provide a fallback. No TV completion/duration integration has yet been verified on a physical Label King Turbo player.

## Already applied to Supabase

Project: `mrtihimklvztdpwjfvtz` (the existing Dash-OS project).

- Hosted migrations `20261015101851_celebrations` and `20261015102549_celebrations_style_null_guard` are applied. Local migrations match the server-assigned versions and SQL.
- `celebration-feed` Edge Function is deployed with custom playback-key authentication. Platform JWT verification is intentionally disabled for this function only: unattended TVs have no employee session. All writes still require the employee's Supabase JWT plus RLS.
- The new private `celebrations` storage bucket and authorization rules are installed.
- No existing employee roles, assignments, passwords, orders, or operational tables were changed. Transactional RLS test fixtures were rolled back.

Do not apply this migration a second time to the same project. It is already recorded in migration history.

## Deployment and custom domain

1. Review and merge the integration branch. The repository's existing Cloudflare build should run `pnpm build` and deploy `dist` using `wrangler.jsonc`.
2. Retain the existing build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. No privileged Supabase key belongs in browser build variables.
3. Add `celebrations.powerspizza.com` as a Cloudflare Worker custom domain for the existing deployment. This same build chooses the celebration experience based on the hostname; the existing domain continues to show Dash-OS. Prefer Cloudflare's custom-domain flow rather than guessing DNS targets.
4. Add the exact production origin `https://celebrations.powerspizza.com` to Supabase Auth's allowed redirect URLs, preserving the existing Site URL and redirects. Google OAuth and email-link sign-in reuse the existing Supabase users. Separate subdomain sessions are not silently shared; users may authenticate once on each origin. No refresh tokens are copied through URLs.
5. Set `VITE_CELEBRATIONS_URL=https://celebrations.powerspizza.com` for the Dash-OS menu link once the domain is live. Before that, the menu uses `/celebrations` on the existing origin.
6. Set `VITE_DASH_OS_URL` to the actual Dash-OS homepage. On the existing host, the back link defaults to that host’s root. On the new subdomain it is hidden until the actual Dash-OS URL is configured; the uniforms domain is not assumed to be the Dash-OS homepage.

The authoring session could access GitHub and Supabase but had no Cloudflare account/DNS control. Custom-domain routing, frontend publication, and sign-in redirect configuration remain rollout tasks. The original ChatGPT-hosted prototype is unchanged and is not the integrated production site. Existing prototype photos have not been migrated; inspect and migrate them before retiring that prototype if any were uploaded.

## First Label King Turbo test

1. Sign into the deployed celebration app as Delaney. Submit and approve two real test photos after verifying the people pictured consent to sharing.
2. In TV playback links, create a named key and immediately copy its Media RSS link. Only its hash is retained, so the full link cannot be recovered later; replace a lost key.
3. In Label King Turbo's Stream from Internet menu choose Media RSS, paste the link, and save. Set a short refresh interval if the player exposes that option.
4. Confirm slide 1 and slide 2 display for 10 seconds each. Check whether the player plays all feed items and returns to the rest of its playlist after one cycle. Generic website metadata does not guarantee this.
5. Change a caption, verify that the GUID/image URL revision refreshes on the player, then remove a test item and verify it disappears after the next feed refresh.
6. Revoke the key and confirm fresh feed/image requests fail. Previously downloaded images may remain in a player cache; revocation cannot erase copies already stored on that device.
7. If that player's Media RSS integration ignores per-item timing or cannot return to the main playlist, use its Web Page option with the generated TV URL for dedicated looping playback. If the TV must reliably return after a dynamically sized loop, a verified player-specific integration or generated finite MP4 is still required; the current browser TV view alone does not guarantee automatic handoff.

Keep the playback URL private to your signage administrators. It grants access to approved slides only but anyone holding it can view those approved slides while it is active.

## Validation

- `pnpm build`: TypeScript and Vite production build.
- `pnpm test`: existing scheduling tests plus new celebration role, expiry, caption, RSS, custom-token, and image-access tests.
- `tests/celebrations-rls.sql`: transactional real-database regression checks; all fixture records and image metadata are rolled back.
- Live Edge Function checks: missing key rejected, valid temporary key returns empty RSS/JSON, revoked key rejected; temporary key removed afterward.
- Supabase security advisors: no new celebration-related findings; pre-existing project findings remain outside this change.

Browser visual/drag-and-drop testing, real employee sign-in across the custom domain, and physical TV playback remain unverified.
