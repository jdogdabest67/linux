# Game Goofer

**Game Goofer** is a browser-based game modification workshop. V1 starts with a Minecraft Bedrock adapter.

**Live site:** https://jdogdabest67.github.io/linux/

## Current features
- Create, rename, open, and delete local projects.
- Save project settings in browser local storage.
- Configure an item pool for the Minecraft Bedrock simple-dungeon chest loot table.
- Upload an optional PNG stone texture.
- Export behavior and resource packs together as a `.mcaddon` file.

## Scope and limitations
- Minecraft Bedrock is the only implemented game adapter.
- The loot generator targets `loot_tables/chests/simple_dungeon.json`.
- Texture replacement is an early resource-pack implementation and needs testing in the target Minecraft version.
- Other games, audio, NPC editors, physics tools, deeper gameplay editing, and live game modification are not implemented yet.
- Projects stay in this browser. Export backups if you clear browser data or change devices.
- ZIP creation uses JSZip from jsDelivr. Game Goofer project data is not uploaded to a Game Goofer server.

## Hosting
The static frontend is published through GitHub Pages. Game Goofer does not require a backend, Cloudflare Worker, account system, or database.

## Retired project infrastructure
JDog Social has been removed from the public frontend and its public social API routes have been disabled in `worker.js`. The Worker still contains separate JoyGPT relay endpoints. This repository update does not delete Cloudflare deployments or Durable Object data; those require Cloudflare dashboard actions.
