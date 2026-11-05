# UNX Inspector: real-file technical report (Deltarune Chapter 1 `game.unx`)

Everything marked **VERIFIED** was produced by running the code in this repo against the attached file (13,068,780 bytes, SHA-256 begins `b8a72ac23af877fb`, unchanged before and after: the file was only ever read). Everything marked **HYPOTHESIS** was not proven. The UI was only exercised through a stub DOM (no browser was available in the build sandbox).

## 1. Did the file parse? VERIFIED: yes
`FORM` signature, little-endian, declared FORM size 13,068,772 = file size - 8. The 31 chunks are contiguous from offset 0x8 to end of file with no gaps, overlaps, unknown chunk names or truncation. Every chunk except the last is 16-byte aligned (size includes padding). Whole-file validation status: **pass** (parse takes about 130 ms in Node 22).

| chunk | header @ | data range | size |
|---|---|---|---|
| GEN8 | 0x8 | 0x10-0x320 | 784 |
| OPTN | 0x320 | 0x328-0x380 | 88 |
| LANG | 0x380 | 0x388-0x3a0 | 24 |
| EXTN | 0x3a0 | 0x3a8-0x3b0 | 8 |
| SOND | 0x3b0 | 0x3b8-0x1b60 | 6,056 |
| AGRP | 0x1b60 | 0x1b68-0x1b80 | 24 |
| SPRT | 0x1b80 | 0x1b88-0x25b20 | 147,352 |
| BGND | 0x25b20 | 0x25b28-0x280b0 | 9,608 |
| PATH | 0x280b0 | 0x280b8-0x280c0 | 8 |
| SCPT | 0x280c0 | 0x280c8-0x2a140 | 8,312 |
| GLOB | 0x2a140 | 0x2a148-0x2a620 | 1,240 |
| SHDR | 0x2a620 | 0x2a628-0x2a630 | 8 |
| FONT | 0x2a630 | 0x2a638-0x55e60 | 178,216 |
| TMLN | 0x55e60 | 0x55e68-0x55e70 | 8 |
| OBJT | 0x55e70 | 0x55e78-0x797a0 | 145,704 |
| FEDS | 0x797a0 | 0x797a8-0x797b0 | 8 |
| ACRV | 0x797b0 | 0x797b8-0x797c0 | 8 |
| SEQN | 0x797c0 | 0x797c8-0x797d0 | 8 |
| TAGS | 0x797d0 | 0x797d8-0x797f0 | 24 |
| ROOM | 0x797f0 | 0x797f8-0x2411e0 | 1,866,216 |
| DAFL | 0x2411e0 | 0x2411e8-0x2411f0 | 8 |
| EMBI | 0x2411f0 | 0x2411f8-0x241210 | 24 |
| TPAG | 0x241210 | 0x241218-0x2543c0 | 78,248 |
| TGIN | 0x2543c0 | 0x2543c8-0x255680 | 4,792 |
| CODE | 0x255680 | 0x255688-0x3e8e00 | 1,652,600 |
| VARI | 0x3e8e00 | 0x3e8e08-0x4021b0 | 103,336 |
| FUNC | 0x4021b0 | 0x4021b8-0x40a6b0 | 34,040 |
| FEAT | 0x40a6b0 | 0x40a6b8-0x40a6e0 | 40 |
| STRG | 0x40a6e0 | 0x40a6e8-0x489e00 | 522,008 |
| TXTR | 0x489e00 | 0x489e08-0x661fe0 | 1,933,784 |
| AUDO | 0x661fe0 | 0x661fe8-0xc769ec | 6,375,940 |

## 2. Version. VERIFIED partial
- WAD/bytecode version: **17**. Game name `DELTARUNE`, display name `DELTARUNE Chapter 1`, window 640x480.
- GEN8 version fields read `2.0.0.0`: the GMS2 placeholder, so they say nothing about the real version.
- The `FEAT` chunk is present, which (per LibGM's version detection) implies GameMaker **2022.8 or later**. No `PSEM` (2023.2+) or `UILR` (2024.13+) chunk, which is consistent with, but does not prove, an earlier version. **The exact GameMaker version is not determined.**
- OBJT uses the 2022.5+ layout (extra `managed` field): VERIFIED from raw words (field is 1 in all 353 records; parent=-100 in 60.7% of objects only under this layout).

## 3. Chunks parsed
- Summary: GEN8, STRG (14,120 strings, all valid).
- Name lists: SOND 151, SPRT 1,093, BGND 59, FONT 12, SCPT 692, OBJT 353 (plus sprite/parent/depth/solid/persistent fields), ROOM 147 (name/caption/size), CODE 1,679. PATH, SHDR, TMLN are empty lists.
- Bytecode (CODE + VARI + FUNC + STRG): all 1,679 entries walk exactly to their end (289,745 distinct instructions; 418,981 counting parent/child entries that share bytecode); all 19,334 `call` operands and 565 pushed function references resolve through FUNC chains (739 entries, 19,899 occurrences, zero leftovers); all 74,480 variable operands resolve through VARI chains (5,166 entries, 3,872 referenced). This self-check runs on every file and gates whether references are shown.
- Recognised but NOT parsed: OPTN, LANG, EXTN, AGRP, GLOB, FEDS, ACRV, SEQN, TAGS, DAFL, EMBI, TPAG, TGIN, FEAT, TXTR, AUDO. Object event tables, room contents, GML decompilation and bytecode version < 15 are unsupported.

## 4. Objects: 353 real objects (VERIFIED).
## 5. Scripts: 692 real SCPT entries (VERIFIED), all 692 linked to a code entry. They are 305 plain names (linked to `gml_GlobalScript_*` code) and 387 `gml_Script_*`-prefixed names (linked to the child code entries that share the same bytecode), so there are fewer distinct script bodies than entries. The 1,679 code entries are 984 `gml_Object_*` event entries, 387 `gml_Script_*` and 308 `gml_GlobalScript_*`; none are room creation code.

## 6. Enemy-related identifiers (VERIFIED present; display-name mapping is HYPOTHESIS)
46 objects match enemy/boss patterns. Your search targets:
- **Rudinn**: `obj_rudinnranger` (idx 258), room `room_cc_rudinn`. **Hathy**: `obj_headhathy` (296), `obj_hathyfightevent` (59), room `room_cc_hathy`. **Jigsawry**: `obj_jigsawryenemy` (260). **Lancer**: `obj_lancerboss` (286), `obj_lancerboss2` (287), `obj_lancerboss3` (290) plus 12 lancer event/cutscene objects; rooms `room_cc_lancer`, `room_cc_prisonlancer`. No script names contain these words.
- Other enemy objects: `obj_dummyenemy`, `obj_placeholderenemy`, `obj_diamondenemy`, `obj_heartenemy`, `obj_clubsenemy`, `obj_checkers_enemy`, `obj_smallcheckers_enemy`, `obj_ponman_enemy`, `obj_rabbick_enemy`, `obj_bloxer_enemy`, `obj_susieenemy`, `obj_king_boss`, `obj_joker`, `obj_chaseenemy` (overworld), `obj_ralseienemy`.
- HYPOTHESIS: `obj_diamondenemy` = Rudinn and `obj_heartenemy` = Hathy (suit names; not proven from this data). The lang-string path for display names has not been traced.

## 7. Where encounter logic lives. VERIFIED from resolved bytecode
Encounter composition is **inline in script bytecode**, not in room data or a data table.
1. `scr_encountersetup(argument0)` (13,664 bytes, 2,583 instructions) is a 32-case `switch` on the encounter number (cases 0-9, 12-25, 27-33, 40; all branch targets land on instruction boundaries). Each case assigns, per slot 0-2, `monstertype[slot]`, `monsterinstancetype[slot]` (an object index), `monstermakex/y[slot]`; the code pushes instance id -5 before each array write, which suggests globals (inference). `tools/extract-encounters.js` decodes these; e.g. case 28 = two `obj_rudinnranger` (type 22), case 29 = two `obj_headhathy` (type 23), case 22 = three `obj_jigsawryenemy` (type 15), case 2 = `obj_lancerboss` (type 2).
2. Triggers: `obj_encounterbasic_Create_0` calls `scr_encountersetup(global.encounterno)`. Eleven code entries assign literal encounter numbers (nine story/event objects, `scr_gamestart`, and `obj_checker_animtest`), e.g. `obj_hathyfightevent` = 9 (case 9 spawns three `obj_heartenemy`, which supports the heart = Hathy hypothesis), `obj_jokerbattleevent` = 25 (spawns `obj_joker`), `obj_kingcutscene` = 40 (spawns `obj_king_boss`), `obj_lancerbattle2_event` = 20 (spawns `obj_lancerboss2`). Ordinary overworld enemies use `obj_chaseenemy`: its Create assigns `self.myencounter` in 18 literal branches (values include 4-7, 16-19, 23, 24, 28, 30, 32, 33, 40) and `Other_10` copies it into `global.encounterno`. `obj_ponman_appear_Step_0` does the same with 13/14.
3. Consumers: `obj_battlecontroller_Create_0` (reads the arrays, 5 `instance_create` calls) and `scr_monstersetup` (per-type stats: name, hp, at, df, exp, gold, act names).
4. Rooms: the legacy per-room instance lists hold 3,513 instances across 147 rooms; none has creation code, and no `RoomCC` code entries exist.

## 8. Still unsupported or unverified
- Branch conditions inside `obj_chaseenemy_Create_0` (which enemy gets which `myencounter`) are not decoded. Cases 3, 4 and 21 of the setup switch contain conditionals, so the extractor's output for them may be incomplete. Case 0 yields no slots.
- `monstertype` id to stats mapping (`scr_monstersetup`) not decoded; display names not traced.
- Variable scope label `stack?` (instruction instance field 0) is inferred from usage statistics, not from documentation.
- ROOM contents beyond name/size/caption are only spot-checked in a research script, not in the reader. Object event tables, TPAG/TXTR/AUDO untouched.
- One file, one chapter, one build. Not tested in a real browser.

## 9. Changes made
- `gm-data-reader.js` 0.2 to 0.3: every entry now carries its source `offset`; CODE entries carry length, locals/args, bytecode address and parent offset (bytecode 15+ layout, verified); string indices stay aligned with STRG; bytecode scan integrated and gated by self-verification; chunk statuses updated; new validation check.
- New `gm-code-scan.js`: instruction walker and function/variable/string reference resolver with built-in verification.
- `unx-inspector.html`: offsets columns, Code and Scripts rows open a references panel (calls, variables, strings, resolved listing), bytecode self-check on Overview, purple theme and mobile layout kept.
- Tests: `tests/test-reader.js` (synthetic fixtures including corrupted bytecode, plus `GM_REAL_FILE` real-file assertions, run and passing against the attached file), `tests/ui-smoke.js` (stub DOM, passing against the attached file).
- Research CLIs: `tools/probe-code.js`, `tools/extract-encounters.js`. Their output is derived from your own copy of the game; do not commit it.
- Earlier fix retained: object layout detection now uses the no-parent share as a tie-breaker (both layouts looked plausible on the real file).
