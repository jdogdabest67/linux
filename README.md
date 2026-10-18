# JoyGPT Controller Link Lab

A small static site for testing what the current phone browser can see. It intentionally does **not** claim to control a Nintendo Switch.

## Live site

https://jdogdabest67.github.io/linux/


## Research workbench (Oct 18, 2026)

The live page now has three additional read-only investigations:

- **Binary file inspector:** choose a local file (up to 10 MiB) to view size, browser MIME type, SHA-256 when Web Crypto is available, the first 256 bytes as hex/ASCII, common file-signature clues, Shannon entropy, and printable strings with offsets. Results can be copied or downloaded as JSON. The file is inspected locally and is not uploaded by this tool.
- **GitHub repository researcher:** scan a public GitHub repo's metadata and recursive file tree, list `.bin` paths with sizes and links, and extract relevant save/format lines from its README. This reads metadata through GitHub's public REST API; it does not download every binary file.
- **Direct URL diagnostics:** request a small byte range from a pasted HTTP(S) URL, then record response status, elapsed time, content type/range headers, and a short first-chunk preview. It cancels body reading after the first response chunk.

These are clues, not a save validator. Strings such as `GameProgressData`, `WorldData`, or `Checkpoint` can come from a schema or data table without proving that a file is a complete save. A successful file transfer also does not mean Switch 2 can import that file.

Error code 2809-1209 is a Nintendo console error rather than an HTTP response code. Nintendo's [published support article](https://en-americas-support.nintendo.com/app/answers/detail/a_id/49828/kw/2809-1209) recommends trying a different internet access point. JoyGPT's URL test can help compare fetch behavior from a webpage, but cannot inspect the console's own error screen or prove that the direct navigation failure has the same cause.

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


## Input-event mapping and game-control route research (Oct 18, 2026)

The Switch browser reports controller-related events reaching the page. Section 8 now records the event type, key/code, repeat/modifier fields, and `isTrusted`; skips text-entry fields; can copy the log; and can optionally relay event summaries to the phone through the live WebSocket connection. The synthetic-event probe creates a fake keydown only in the webpage and reports whether the browser marks it trusted. It does not send any event to the Switch OS/game.

Section 7 includes a ten-marker WebSocket latency/reliability probe and recent echo RTT min/average/max. This measures the message transport only.

### What could make commands reach a game?

A web page's DOM events and an actual controller report are different layers. The best documented architecture we found is a physical controller bridge: browser commands → a serial/network link → a microcontroller acting as a Switch-compatible controller. [PhantomHand's project](https://github.com/noov-smash/PhantomHand) documents an ATmega32U4 Arduino Leonardo with a serial adapter and the [NintendoSwitchControlLibrary](https://github.com/lefmarna/NintendoSwitchControlLibrary). This gives us a credible design pattern, not proof that those exact components work on Switch 2. Test compatibility before buying hardware or writing an implementation around it.

Other possibilities:
- [Android BluetoothHidDevice](https://developer.android.com/reference/android/bluetooth/BluetoothHidDevice) is a native Android API, not a browser API, and requires an installed app plus Bluetooth permissions. This is currently blocked by the managed-phone/browser-only setup; compatibility with Switch 2 is not established.
- [joycontrol](https://github.com/mart1nro/joycontrol) explores controller emulation over Bluetooth using a Linux host. It would require checking the old desktop, its Bluetooth adapter, and whether the project supports Switch 2. That support is not assumed.
- Browser-only JavaScript has no known path from this page to an actual game controller report. The Switch browser scan found no WebUSB/WebHID/Web Bluetooth APIs, visible Gamepad device, or exposed `window.nx` applet object.

Nintendo's official [Switch and Switch 2 accessory compatibility page](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68426/~/nintendo-switch-and-nintendo-switch) confirms compatibility for specified controllers and accessories but does not establish compatibility for our custom microcontroller bridge. Treat Switch 2 support as an open hardware test.

### Sources
- [PhantomHand README](https://github.com/noov-smash/PhantomHand), controller bridge architecture and required hardware.
- [Android BluetoothHidDevice reference](https://developer.android.com/reference/android/bluetooth/BluetoothHidDevice), native app API.
- [MDN Event.isTrusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted), distinguishes browser-generated events from events dispatched through JavaScript.
- [Cloudflare Durable Objects WebSocket docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), live two-way browser-to-server relay.
- [Nintendo Switch 2 compatibility](https://en-americas-support.nintendo.com/app/answers/detail/a_id/68426/~/nintendo-switch-and-nintendo-switch), official supported accessory list.
