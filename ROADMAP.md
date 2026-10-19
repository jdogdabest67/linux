# JDog Social feature roadmap

This roadmap gathers the JDog Social ideas recoverable from the project discussions and the current repository. It separates existing work from additions so we do not rebuild features that already exist.

## 1. Already present in the repository

- **Profiles:** usernames, display names, bios, pronouns, favorite game, accent color, avatar, and banner URL.
- **Social graph:** follow/unfollow and follower/following counts.
- **Posts:** text posts and optional image URLs, search/sort, local drafts, and author deletion.
- **Interactions:** likes/reactions, replies/comments, interaction notifications, post reports, and account blocking.
- **Groups:** create, browse/search, join/leave, group owners, separate group pages, and group posts.
- **Responsive organization:** separate pages and grouped site navigation.

The group feature and any backend changes still need a successful Cloudflare Worker deployment to become live. Always test the public site after the frontend and Worker have both finished deploying.

## 2. Best next additions, in order

### Phase A: Make the beta reliable

1. **Deployment and smoke tests**
   - Keep a small checklist for registration, sign-in, profile save, post creation/deletion, reactions, replies, notifications, block/report, group create/join/post/leave, and mobile navigation.
   - Add a visible backend health/version check so an old Worker produces a clear warning.
   - Use a preview deployment or test branch before changing the main site.

2. **Improve the feed**
   - Add a real **Following** feed, separate from an **Explore / Recent** feed.
   - Move followed-account post tracking from browser storage to the backend, so it follows the account between devices.
   - Add topic tags such as games, memes, art, projects, and tutorials; let people click a tag to browse related posts. Keep general tags instead of forcing posts into a narrow fan-art category.
   - Keep search and newest-first sorting; add a simple tag filter before attempting complicated ranking.

3. **Shareable creator profiles**
   - Add a public route such as profile.html?user=username so a profile can be linked directly from posts or elsewhere.
   - Show the creator's profile, follower count, posts, selected Dog Bone badge, favorite game, and follow button on one page.
   - Add Open Graph preview metadata to shareable pages and a basic sitemap when the site is ready to be indexed. Do not expose private account data in search metadata.

### Phase B: Add the brainstormed creator features

4. **Dog Bone creator awards**
   - Implement the discussed milestone tiers: **Normal at 10K followers, Metallic at 100K, Golden at 1M, and Amethyst at 10M**.
   - Compute eligibility on the server from unique follower relationships, not a number a user can edit.
   - Let eligible creators choose which earned badge to display. Never sell the badge or let a user award one to themselves.
   - Add basic anti-abuse rules first: rate limits on account creation/following, one follow per account pair, and a way to remove spam/fake accounts. Treat milestones as a fun prototype feature, not a verified real-world award.

5. **Video sharing without becoming a video-hosting service**
   - Reintroduce a video-post type that accepts a **YouTube URL**, creates a clean preview card, and links back to the original video.
   - Start with ordinary links; optionally embed using YouTube's privacy-enhanced player at youtube-nocookie.com when the uploader allows embedding. Always keep a clear Watch on YouTube link and do not autoplay.
   - Do not download/re-upload creators' videos or pretend the video belongs to the poster. Require a link to the original source, retain report controls, and remove broken/removed embeds.
   - Avoid direct user video uploads for now. YouTube controls hosting and playback, so JDog Social avoids storing huge video files or paying to serve them. If native uploads are ever added, first design upload limits, consent/rights rules, abuse reporting, file validation, storage budgets, and deletion tools.

6. **Better notifications**
   - Keep replies and likes notifications, then add follow notifications and optional notifications for activity in groups a person joined.
   - Store unread/read state on the server so it works on multiple devices.
   - Add a simple notification filter or “mark all read”; do not build live chat just to make notifications feel instant.

7. **Group quality-of-life**
   - Add group-specific search/filtering and clearly show membership state.
   - Add owner tools for deleting a group, deleting abusive posts, and eventually appointing moderators.
   - Add tags/categories for groups so people can discover game, hobby, and project communities.
   - Send group notifications only after the core notification system is reliable.

### Phase C: Safety and scale before a wider public launch

8. **Basic abuse protection**
   - Add server-enforced rate limits for account creation, login attempts, follows, posts, replies, reactions, and reports.
   - Consider Cloudflare Turnstile for sign-up/login forms, with server-side token validation. A browser-only widget is not enough by itself.
   - Add a small reports dashboard and owner-only moderation actions. Reports and blocks already exist, but the repository does not yet have a moderation dashboard/admin role.
   - Write short community rules and a privacy note; offer a clear account/post deletion process. Avoid collecting extra personal details that the site does not need.

9. **Make storage scale without surprising overwrites**
   - Today, much of the social data is stored as large arrays/maps under a small number of Durable Object keys, and the Worker uses one named Durable Object for the social service. That is acceptable for a tiny prototype but can become a hot spot and make concurrent updates awkward.
   - Before a larger public launch, migrate core records to structured tables (for example Cloudflare D1, or SQLite tables in an appropriately designed Durable Object): users, profiles, follows, posts, reactions, comments, groups, memberships, notifications, and reports.
   - Migrate with a backup and a test copy first. Preserve existing user accounts, password hashes, sessions where possible, post IDs, group IDs, and the current Durable Object namespace. Do not simply change the Durable Object's ID, which could point the code at fresh empty storage.
   - Add pagination and record-size limits instead of repeatedly returning large lists.

10. **Media plan that respects the no-surprise-bill rule**
   - For now: keep post and group images as public URLs, validate URLs, and keep profile avatars resized and capped.
   - Later, if actual image uploads become necessary, Cloudflare R2's current standard-storage free allowance is 10 GB-month, 1 million Class A operations, and 10 million Class B operations per month, with free egress. R2 still needs account setup and usage can become billable above the included tier, so set budget alerts/limits and confirm billing settings before turning uploads on.
   - Native video files are a separate, much more expensive design problem than linking to hosted videos. Do not enable them as a casual add-on.

## 3. Hosting recommendation

The frontend currently uses GitHub Pages, with the API on a Cloudflare Worker. For the small private testing phase, keep changes minimal and keep the current URL stable. Before making JDog Social a larger public service, review GitHub Pages' stated restrictions and consider moving the static frontend to **Cloudflare Pages**. Pages can connect directly to the GitHub repository and auto-deploy pushes; its static-asset requests are free and unlimited, while API/function traffic still counts toward Workers limits. This also keeps the app's hosting and backend under one provider.

Do not rename the GitHub repository just to change the displayed brand: the Pages URL currently contains /linux/. The website's visible brand can be JDog Social while internal storage keys and the repo slug stay unchanged to avoid breaking links or losing access to stored data.

## 4. Cost notes checked 19 October 2026

- Cloudflare Durable Objects on the Workers Free plan include up to **100,000 requests per day**, **13,000 GB-seconds of duration per day**, **5 million row reads per day**, **100,000 row writes per day**, and **5 GB total SQL storage** for SQLite-backed objects. Limits are not a promise that this prototype has unlimited capacity; exceeding free limits can cause operations to fail. See [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- Cloudflare R2's Standard free tier currently includes **10 GB-month storage**, **1 million Class A operations**, **10 million Class B operations**, and free egress. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- Cloudflare Pages supports GitHub/GitLab integration and automatic deploys; static-asset requests are free and unlimited, but backend requests still count toward Workers quotas. See [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) and [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).
- GitHub Pages documentation says Pages is not intended or allowed as a free host for sites primarily directed at commercial SaaS. JDog Social is an experiment today, but moving the frontend before a bigger launch is the safer long-term plan. See [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- YouTube supports embedding videos and playlists; privacy-enhanced embeds use https://www.youtube-nocookie.com/embed/VIDEO_ID. Embedding remains subject to YouTube's terms, and some videos cannot be embedded. See [YouTube's embed guide](https://support.google.com/youtube/answer/171780?hl=en).
- Cloudflare recommends combining Turnstile on forms with server-side request rate limiting for better bot-abuse protection. See [Cloudflare's bot-protection guidance](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/).

## 5. Recommended immediate sequence

1. Verify that the current Worker deployment supports the groups and notification endpoints present in the repository.
2. Build the Following/Explore feed and topic tags.
3. Build shareable profile pages.
4. Add server-calculated Dog Bone badges.
5. Bring back video sharing as **source-link cards/optional YouTube embeds only**, not direct video uploads.
6. Add cross-device follow notifications and a basic moderation dashboard before inviting a larger audience.
7. Plan the Cloudflare Pages migration for the next hosting milestone; preserve the existing data and URL until a deliberate migration is ready.
