# Deploying Outfit Arena for v1 testing

Outfit Arena lives at `/outfits` inside this repo. It shares the database and
sign-in with the lending product but nothing else — no lending code imports it,
and it imports no lending code.

---

## What it needs to run

| Variable                                                   | Required   | What happens without it                                                      |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                                             | **Yes**    | Nothing works.                                                               |
| `JWT_SECRET`                                               | **Yes**    | Nobody can hold a session.                                                   |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | **Yes**    | Nobody can sign in.                                                          |
| `ANTHROPIC_API_KEY`                                        | For the AI | Uploads still save; every AI feature degrades to a placeholder.              |
| `BUILT_IN_FORGE_API_URL` / `_KEY`                          | For images | Uploads go to local disk instead of S3; generated imagery is skipped.        |
| `LOCAL_STORAGE_DIR`                                        | No         | Defaults to `.local-storage/`. Only read when the two forge vars are absent. |

### The AI key

`ANTHROPIC_API_KEY` drives all three AI features: the stylist critique on an
uploaded outfit, garment cataloguing in the wardrobe, and outfit suggestions.
Get one from the Anthropic Console and add it to your host's secrets.

Without it the app does not break — it degrades. Uploads save, photos display,
battles and ratings and the leaderboard all work. But every outfit scores a flat
50, every garment catalogues as "Untitled item", and the stylist reports itself
unavailable. That is verified behaviour, not a guess: the end-to-end run below
was done with no key configured.

---

## Before the first deploy: run the migrations

Three migrations create every Outfit Arena table and have **never been applied
to the production database**:

```
drizzle/0003_elite_peter_quill.sql    outfit_posts, outfit_ratings, outfit_matchups, outfit_follows
drizzle/0004_dazzling_veda.sql        wardrobe_items, wardrobe_outfits, outfit_comments
drizzle/0005_spicy_tyger_tiger.sql    wardrobe_models, generated-image columns
```

```bash
pnpm db:push
```

Until this runs, every Outfit Arena page will error against the live database.
The lending tables are untouched by all three.

---

## Option A — the current host (fastest)

The app is already wired for it: storage, sign-in and the database all work
there today.

1. Add `ANTHROPIC_API_KEY` to the project secrets.
2. Run `pnpm db:push` against the production database.
3. Deploy this branch.
4. Visit `/outfits`.

Nothing else changes. Existing lending routes are unaffected.

---

## Option B — anywhere else (Railway, Render, Fly, a VPS)

Uploads no longer require the hosted storage service — with `BUILT_IN_FORGE_*`
unset, photos are written under `LOCAL_STORAGE_DIR` and served back through the
same `/manus-storage/<key>` route. That makes a standalone deploy possible:

```bash
pnpm install
pnpm db:push
pnpm build
pnpm start
```

with `DATABASE_URL`, `JWT_SECRET` and `ANTHROPIC_API_KEY` set.

**Two things to know before choosing this.**

_Sign-in still goes through the current provider._ `getLoginUrl()` in
`client/src/const.ts` redirects to `${VITE_OAUTH_PORTAL_URL}/app-auth`. Hosting
elsewhere does not move authentication — you would need to replace that flow
with your own provider first. This is the real blocker for going fully
standalone, and it is unstarted work.

_Local disk is single-box only._ Files live on one machine and vanish with it.
Fine for a v1 trial on one instance; not fine behind a load balancer or on a
host with an ephemeral filesystem. Point `storagePut`/`storageProxy` at real
object storage before scaling out — `server/storage.ts` is the only file that
needs to change.

---

## Generated imagery

Clean product shots and "see it worn" renders are the one feature that is not
Claude — Claude reads images but cannot draw them, so `server/wardrobeImages.ts`
calls a separate image service. With `BUILT_IN_FORGE_*` unset those calls are
skipped and garments simply show their original photo, which is a supported
state, not an error.

---

## Verifying a deploy

Sign in, then walk this path — it is the same one the end-to-end test drives:

1. `/outfits/upload` — post a photo. It should appear in the feed with its image.
2. `/outfits` — the photo renders, and its `<img src>` under `/manus-storage/`
   returns 200 with real bytes.
3. `/outfits/wardrobe` — add a garment; it should appear in My Closet.
4. `/outfits/battle` — needs at least **two outfits from other people**; you
   cannot be shown your own. Vote, and the Elo moves ±16.
5. `/outfits/leaderboard` — the winner's rating has changed.

If step 1 saves but the stylist feedback reads "temporarily unavailable", the
app is healthy and `ANTHROPIC_API_KEY` is missing or rejected. Check the server
log for `AI stylist analysis failed`.
