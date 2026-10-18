# J-DogBrew Social × JoyGPT

J-DogBrew Social is the early social layer; JoyGPT provides browser-to-browser messaging and a low-rate camera snapshot feed.

Live site: https://jdogdabest67.github.io/linux/

## Message formats
- Plain text
- Markdown text displayed safely as text
- Structured JSON
- Event/data objects
- Metadata objects
- Reactions/emoji
- Status updates
- Files up to 10 MB, including binary files, images, audio, video, documents, and archives

Typed JSON payloads are limited to 12 KiB. Messages relay to connected browsers in the same session. The session code is not strong authentication and messages are not end-to-end encrypted. Use test data only.

## Accounts and permanent posts
- Regular account registration and sign-in; usernames are 3–20 letters, numbers, or underscores.
- Passwords are salted and hashed server-side with PBKDF2-HMAC-SHA-256.
- Login sessions are bearer tokens saved in this browser for up to 30 days. Sign out to remove the token from this device.
- Public posts persist in Durable Object storage. The newest 100 posts are shown; storage retains up to 1,000.
- This prototype has no admin roles, password reset, email verification, moderation dashboard, or rate limiting. Use a unique password and do not treat it as a production-secure social network.

## Live Feed v0.2
This is a prototype snapshot stream, not continuous video. After the user explicitly presses Start Live Feed and grants camera permission, the browser captures compressed JPEG snapshots at about one frame per second and sends them over the existing WebSocket binary relay. Frames are limited to 180 KiB. Users can choose a front/back camera and balanced, sharper, or smaller snapshots, with a compression fallback. No audio is captured. Stop feed shuts down camera tracks. Timing depends on device performance and network conditions.

## Deployments
GitHub Pages deploys index.html and app.js. The backend in worker.js is a separate Cloudflare Worker using the existing Durable Object binding in wrangler.jsonc. Deploy both separately when needed. The new page expects /api/health to return version social-v1; deploy worker.js to Cloudflare if the page reports an old version.

## Limitations
- This page does not control a game or create a Switch controller connection.
- Sending a .bin file transfers bytes only; it does not import or validate game save data.
- Live Feed sends snapshots from the device camera, not direct console screen capture or audio.
- The relay is not a private or encrypted messenger. Do not send sensitive information.
