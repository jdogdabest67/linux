# Game Goofer

**Game Goofer** is a browser-based game modification workshop. Minecraft Bedrock is the first implemented adapter.

**Live site:** https://jdogdabest67.github.io/linux/

## Minecraft Bedrock V1
- Local project management and browser storage.
- Simple dungeon chest loot randomizer.
- Block-drop loot overrides for 16 common blocks.
- Mob-drop loot overrides for 16 common mobs.
- Custom 2x2 shaped crafting recipe.
- Gamerule presets exported as a `.mcfunction` file. Run `/function game_goofer_rules` in-game.
- Optional stone PNG resource pack replacement.
- Behavior and resource packs bundled as a `.mcaddon`.

## Important limitations
- Selected block and mob loot tables replace vanilla drops. Test in a separate world first.
- Mob loot randomization changes drops, not mob spawning.
- The custom recipe adds a new recipe; it does not replace vanilla recipes.
- Gamerules must be applied by running the exported function.
- Other games, live modification, custom entity creation, audio editing, and full texture atlas editing are not implemented yet.
- Projects stay in this browser. Export backups if you clear browser data or change devices.
- ZIP generation uses JSZip from jsDelivr.

## Hosting
The static app is published through GitHub Pages. Game Goofer itself does not host Minecraft servers and has no backend.

## Retired project infrastructure
JDog Social has been removed from the public frontend and its public social API routes disabled in `worker.js`. The Worker source retains separate JoyGPT relay endpoints. Cloudflare deployment and storage cleanup must be done separately.
