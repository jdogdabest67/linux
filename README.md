# JoyGPT Messaging Lab

JoyGPT is focused on browser-to-browser messaging between a phone and the Nintendo Switch browser.

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

## Live Feed v0.1
This is a prototype snapshot stream, not continuous video. After the user explicitly presses Start Live Feed and grants camera permission, the browser captures compressed JPEG snapshots at about one frame per second and sends them over the existing WebSocket binary relay. Frames are limited to 180 KiB and approximately 480 pixels wide, with a compression fallback. No audio is captured. Stop feed shuts down camera tracks. Timing depends on device performance and network conditions.

## Deployments
GitHub Pages deploys index.html and app.js. The backend in worker.js is a separate Cloudflare Worker using the existing Durable Object binding in wrangler.jsonc. Deploy both separately when needed. The new page expects /api/health to return version ws-lab-3; deploy worker.js to Cloudflare if the page reports an old version.

## Limitations
- This page does not control a game or create a Switch controller connection.
- Sending a .bin file transfers bytes only; it does not import or validate game save data.
- Live Feed sends snapshots from the device camera, not direct console screen capture or audio.
- The relay is not a private or encrypted messenger. Do not send sensitive information.
