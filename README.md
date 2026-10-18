# JoyGPT Controller Link Lab

A small static site for testing what the current phone browser can see. It intentionally does **not** claim to control a Nintendo Switch.

## Live site

https://jdogdabest67.github.io/linux/

## What remains

- Browser capability check for secure context, WebUSB, WebHID, Web Serial, Web Bluetooth, and Gamepad API.
- Optional Gamepad API monitor for input from a controller exposed to the phone.
- Short, source-linked notes about the actual GameShare and PhantomHand requirements.

## What was removed

The prior page included a pretend C-to-WebAssembly packet encoder, a simulated PhantomHand packet encoder/decoder, and direct USB/HID controller-opening tests. Those tests did not establish a working Switch-control route. The direct USB test could also claim a controller interface and interrupt its existing connection, so it was removed.

## Findings (checked October 18, 2026)

### Super Mario Odyssey GameShare

Nintendo's official [Odyssey multiplayer instructions](https://en-americas-support.nintendo.com/app/answers/detail/a_id/27785/p/988) say that in two-player mode player 1 controls Mario and player 2 controls Cappy. In GameShare + Local Play, the host is on Switch 2 and the guest joins from a second Switch 2 or Switch console. A phone browser cannot join as a console.

### PhantomHand

The [PhantomHand repository](https://github.com/noov-smash/PhantomHand) describes a browser app that talks to a microcontroller. Its [Getting Started Guide](https://github.com/noov-smash/PhantomHand/blob/main/GettingStartedGuide.md) calls for an ATmega32u4 microcontroller (such as Arduino Leonardo) and a separate FT232 wired serial module or CC2640R2F wireless serial module. The guide says phones/tablets are not supported, although Android may work but had not been tested. It describes desktop Chrome setup.

The central design is browser → serial adapter → Arduino configured as a Switch-compatible USB controller. It is not phone browser → Switch directly, and the current hardware lacks that bridge.

## Current limits

- Web APIs reported by a browser do not prove that a specific device is compatible.
- Gamepad API input is only input to this webpage. It does not inject control into the Switch.
- A controller paired to the phone should be treated as phone input during this test; do not expect it to keep controlling the Switch at the same time.
- The direct phone-to-Switch USB-C test previously showed Android's file-transfer/tether/MIDI/charging choices and did not make the console accept the phone as a controller.
- A software-only browser page cannot replace the missing hardware bridge or a second Nintendo console.

## Next useful test

Open the live page on the phone, run the capability scan, and use the input monitor only if a controller is connected to the phone. Report the API list and whether buttons/axes show up. These results can rule browser routes in or out, but will not by themselves control the Switch.


## Signal-test backend

The static GitHub Pages site cannot store messages by itself. `worker.js` is a small Cloudflare Worker API and `wrangler.jsonc` binds a Durable Object to store the last 100 test messages. It stores a small allowlist of test messages and webpage commands (`PING`, `SAY:...`, `FLASH`, and `PRESS:...`). Commands are polled by the page; this does not send controller input to a game.

### Deploy it

1. Sign in to a Cloudflare account and open Workers & Pages.
2. Deploy the Worker using `worker.js` and `wrangler.jsonc` (the configuration requires a Durable Object named `SignalStore`). Cloudflare's [Workers documentation](https://developers.cloudflare.com/workers/static-assets/get-started/) explains dashboard and CLI deployment.
3. Note the HTTPS `workers.dev` URL.
4. Open the JoyGPT page on both the Switch browser and phone. Enter the same Worker URL and session code on both.
5. On the Switch browser, press **Send PING from this browser**. On the phone, press **Check received messages**. A message shown on the phone proves the Switch browser's request reached the backend and was stored.

This backend does **not** receive commands from the Switch operating system; it only receives HTTP requests made by a browser page. The API is public and intended for harmless test messages only. Do not send personal or sensitive data. The session code is a simple test filter, not strong authentication.


## Remote webpage command experiment

After the latest GitHub Pages update has deployed:

1. Open the page on both phone and Switch 2, enter the same Worker URL and session code (`FRIES-001`).
2. Set the phone's **This device is** menu to **Phone** and the Switch page to **Switch 2**.
3. On the Switch page, press **Start listening** and wait for “ready for new commands.”
4. On the phone, press **Say hello**, **Flash screen**, **Press demo A**, or **Press demo UP**. You can also edit the command field. The Switch webpage should react after its next poll (normally within about two seconds).

Allowed commands: `SAY:your message`, `FLASH`, and `PRESS:A/B/X/Y/UP/DOWN/LEFT/RIGHT/START/SELECT`. A PRESS command programmatically activates only the test button on this webpage. It is **not** a real Switch controller press and does not control a game. This is a real remote-command test between browser pages and a stepping stone for investigating a genuine controller path.


## Live WebSocket test bench (new)

The page includes a WebSocket link test and a webpage input-event recorder.

- The WebSocket panel checks `GET /api/health` for version `ws-lab-1`, opens `/api/socket`, sends harmless text markers, and measures the sender's echo round-trip time. The Durable Object echoes to the sender and relays the same marker to other connected pages using the same session.
- The input-event recorder logs ordinary DOM events visible to the page (`keydown`, `keyup`, `click`, `pointerdown/up`, and Gamepad API connection events). It cannot see protected browser/OS inputs, and it does not generate input.
- Neither experiment controls the Switch operating system or sends controller input to a game.

### Important: deploy the Worker update too

GitHub Pages serves `index.html` and `app.js`; the backend is a separate Cloudflare Worker. The new WebSocket test will say the backend needs updating until the deployed Worker supports the `/api/health` endpoint with version `ws-lab-1` and the `/api/socket` route. Deploy the updated repository `worker.js` and its existing `wrangler.jsonc` Durable Object binding/migration through the same Cloudflare deployment method used originally. If the Worker is managed separately in the Cloudflare dashboard, changing this GitHub repository does not automatically update that deployed Worker unless the dashboard deployment is connected to this repository.

### Why test WebSockets?

The Switch browser reported that its `WebSocket` constructor is exposed. Browser WebSockets keep a two-way connection open, avoiding the repeated HTTP polling currently used by the remote-page demo. Cloudflare Durable Objects officially support WebSocket endpoints and relays. These findings make WebSockets worth testing as a transport, but do not imply that the browser can inject button presses into a game.

References:
- MDN, [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- Cloudflare, [Use WebSockets with Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
