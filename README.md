# JDog Social

JDog Social is an experimental community site for posts, profiles, followers, groups, and creator features.

**Live site:** https://jdogdabest67.github.io/linux/  
**Feature roadmap:** [ROADMAP.md](./ROADMAP.md)

## What is in the social app

- Account registration and sign-in; usernames are 3–20 letters, numbers, or underscores.
- Custom profiles with display names, bios, pronouns, favorite games, accent colors, avatars, and banner-image URLs.
- Public posts with optional image URLs, topic categories, an Explore feed and a Following feed, likes/reactions, replies, and post deletion by the author.
- Server-calculated Dog Bone creator badges at 10K, 100K, 1M, and 10M followers; eligible creators can choose which earned badge to display.
- Follow/unfollow, people lookup, direct interaction notifications, and basic block/report controls.
- Groups with owners, member lists, separate group pages, and group post feeds.

This is still a prototype. The repository contains the frontend, while worker.js is deployed separately as a Cloudflare Worker using Durable Object storage. A feature present in the repository is not proof it is deployed or working on the public site. Check the live API and deployment after backend updates.

## JoyGPT experiment

This repository also contains a separate JoyGPT WebSocket relay and low-rate camera snapshot experiment. It is not the same thing as JDog Social's posts or groups. The relay is not end-to-end encrypted or suitable for private messages, and the camera feature sends snapshots from the device camera rather than direct console capture. Use test data only.

## Current prototype limitations

- No admin roles or moderation dashboard yet.
- No password-reset or email-verification flow.
- No server-side rate limiting yet.
- The notification feed for posts by followed accounts includes device-local tracking; it is not yet a fully synchronized following feed.
- Images are attached through public URLs on posts/groups. Profile pictures are resized in the browser and stored with profile data, rather than managed as a separate media service.
- Do not treat this prototype as a production-secure social network. Use a unique password and never post private information.

## Deployment

The frontend currently publishes through GitHub Pages. The Cloudflare Worker backend must be deployed separately through Cloudflare. See ROADMAP.md for the low-cost implementation plan and official documentation links.
