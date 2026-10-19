# D1 + R2 migration plan

This is a staged plan for JDog Social. The live site currently uses GitHub Pages for the frontend and a Cloudflare Worker with Durable Object storage for social data. **Adding this plan and schema does not create Cloudflare resources, deploy code, or migrate any existing records.**

## Target architecture

- GitHub Pages stays the frontend for now.
- The existing Cloudflare Worker remains the public API.
- Cloudflare D1 stores structured social data.
- Cloudflare R2 stores uploaded media bytes; D1 stores media metadata and object keys.
- Durable Objects remain available for the separate JoyGPT/WebSocket relay where coordinated real-time state is useful.

## Safe order of operations

1. Create a D1 database in the Cloudflare dashboard and run `schema.sql` against that database.
2. Create a private R2 bucket for JDog Social media. Do not expose account secrets or allow arbitrary public writes.
3. Add D1 and R2 bindings to a test/staging Worker first. Keep the existing production Worker binding and Durable Object data untouched.
4. Implement and test D1-backed routes behind a feature flag or separate staging Worker. Do not switch authentication until password hashes and sessions have a reviewed migration path.
5. Export the existing Durable Object records and make a verified backup. Count and validate records before and after import.
6. Migrate a low-risk feature first, then posts/follows/groups, and media last. Compare responses and record counts before routing production traffic to each D1-backed route.
7. Keep a rollback plan. Never run the old and new writers independently without an explicit synchronization strategy.
8. Add rate limits, pagination, monitoring, backup/restore tests, and media validation before public promotion.

## Important implementation notes

- Existing password records use PBKDF2-SHA-256 with 100,000 iterations and a per-user salt. Preserve the exact format during migration and test sign-in before cutover.
- Existing sessions are bearer tokens currently stored as keys. Prefer storing a SHA-256 hash of each token in D1 and update the Worker consistently; do not log tokens.
- Existing profile pictures and custom banners can be data URIs. R2 migration should decode and validate only allowed image types, enforce size limits, and replace profile values with controlled URLs/object keys.
- D1 uses SQLite semantics. Use prepared statements, transactions/batches where appropriate, and indexes for feed/follow queries.
- Do not put D1 credentials in frontend JavaScript. Bind D1/R2 only in the Worker environment.
- Do not delete or clear Durable Object data until migration and rollback have both been verified.

## Files

- `schema.sql`: initial relational schema for users, profiles, sessions, posts, follows, comments, reactions, reports, blocks, notifications, groups, group membership, group posts, and media metadata.
- `worker.js`: current production implementation, still backed by Durable Object storage. It is intentionally not switched to D1 by this preparatory commit.

## Official documentation

- D1: https://developers.cloudflare.com/d1/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- R2: https://developers.cloudflare.com/r2/
- R2 Worker bindings: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- Workers bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
