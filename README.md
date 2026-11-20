# 深燈地牢 · Reading Dungeon

A browser-based reading comprehension game for Hong Kong Primary 1–6. Pupils follow Traditional Chinese clues to explore a pixel-art dungeon, operate mechanisms, and escape guardians.

## Run locally

From the repository root, start a local server with `python3 -m http.server 8000 --bind 127.0.0.1`. The game includes its artwork and audio. [Open the game locally](http://127.0.0.1:8000/).

## Play

Read the clue and choose a door, person, item, crossing or nearby control. A single click or keyboard activation sends the explorer to that target. Hover and keyboard focus outline the actual sprite. People and items stand beside the walking lane. Correct door choices follow a continuous path without a midpoint pause.

The first gameplay action starts the Lantern Hop chiptune quietly. Guardian Chase takes over on entering the boss arena. Lantern Hop resumes after escape. **暫停 → 音樂** and **暫停 → 音效** save independent settings in this browser. The quiet cues play at door openings, boss launches, feeding and other visible actions.

A new run opens at 地牢入口 with three hearts and zero coins. Click or tap the illustrated doorway, or focus it with the keyboard and press Enter. Time starts on arrival in the first room. **再入地牢** starts a fresh run. Reloading an active journey returns to the current encounter and its coin total.

The entrance leads to one of eight areas. Four new destinations join 石砌地牢, 沉水墓穴, 螢菇洞窟 and 熔火工坊.

| Area | What the pupil sees |
| --- | --- |
| 古印書庫 | Bookcases, archivists and seal-marked containers |
| 霜晶冰堡 | Ice galleries, fur-clad guides and reinforced expedition chests |
| 琥珀蜂宮 | Honeycomb chambers, veiled beekeepers and hive-marked vessels |
| 星軌天文臺 | Astronomical instruments, observatory staff and brass-trimmed cases |

The first area has 8–10 planned rooms and later areas have 9–11. One shuffled pool supplies doors, people, items, bridges, ladders, treasure chests, cart dispatches, sluices, signal drums, minecart levers, feeding trays and floodgates. Every card is drawn before that set reshuffles. The draw carries into the next area. The first two rooms of a fresh run use simple, safe activities. Each room has a correct action. Treasure chests appear directly in the draw.

Earlier regional quests are back in the draw. They include returning a lost ledger, delivering a message, finding a guide, exchanging a password, asking a witness for information, collecting a deposited object and checking a bridge. A correct return visibly transfers the book to its owner.

At the end of an area, complete **關印查驗** to earn a seal and then read **界門封印** to identify the way out. In the final room, identify the gatekeeper who can read the seal, then follow their directions. The final door has two essential details at the lower bands and three at the upper band. Wrong doors allow a free retry. Only the matching exit leads to a randomly selected different area.

## Two steps in one room

In **礦道交更**, two miners stand beside a stationary cart and its levers. Choose the miner described in the first instruction. The miner tells the pupil which lever to use. The explorer stays beside the miner, the door stays shut, and the lever clue remains on screen while the pupil chooses. Reopening the game or retrying a lever preserves that clue.

The same pattern appears at feeding trays, drain controls, sluices, signal drums, chests, doors, cart dispatches and area gates. Depending on the room, the pupil may consult a person or find a record in a marked box. Door-choice rooms begin by locating the source of the instructions. Two-step encounters become more common as the pupil clears rooms. Simple encounters and treasure rooms continue throughout the run. Each completed room earns one countdown bonus.

## Operating a machine

Read the markings on the installed machines and press the button on the matching one. On a correct press, the button engages and the northern door opens. A wrong press releases for a retry. The machines stay mounted throughout.

A dispatch order asks the pupil to identify a specific minecart. Sending the correct cart along its horizontal rail unlocks the door. The separate miner-and-lever quest also appears in the draw.

## Clearing a blocked path

In **礦車讓道**, one stationary minecart blocks the road ahead. Pull a nearby lever to send it left or right along the horizontal track. A wrong control leaves the route blocked. The north door opens as the cart clears the walking lane.

In **守門獸的晚餐**, a beast guards the doorway. Tap a bowl to put a fish in it. With the right offering, the beast walks to that bowl and stays there eating while the explorer goes through the door. With a wrong bowl, the beast keeps guarding the door.

In **退水石道**, water covers the stone path. Tap a nearby lever and watch the water level. The working drain exposes the crossing. The explorer automatically walks through the door when the obstacle clears. These blocked-path rooms allow free retries. Crossing the cleared room adds three seconds to the guardian countdown.

Beginning readers start with short directions and two choices. Once they have recognised a target word elsewhere, it can return as a practice clue. A pupil might read 「石路被水淹了。拉下紅色拉桿放水。」 Older pupils also get these short rooms between more demanding encounters. A longer clue might identify both the channel to drain and the empty basin that can receive its water. The three choices include the right channel with a full basin and the wrong channel with an empty one.

## Reading difficulty and vocabulary

The game uses the last active pupil’s saved reading progress when available. A fresh browser starts with short clues, and the difficulty adapts to the pupil’s first choices.

The eight areas each teach 31 terms. The six groups cover ownership and handover, quantity, combined conditions and exceptions, spatial relationships, references and comparison, and workmanship. Local missions give words different uses. A pupil might interpret a tide record in the tomb, trace the owner of a book in the archive, or route a mirror lens to the observatory.

Each assessed room focuses on one word. At higher bands several visible conditions can matter. Exactly one option meets the whole clue. Each essential condition has its own plausible wrong option that matches the other conditions. A pupil who understood the focus word but missed a supporting detail receives neutral evidence for that word.

Only the first independent choice contributes evidence. Two focus-word misses in the last three assessed attempts lower the word by one band, down to band one. Five correct answers in the last six, spanning three different situations, promote the word or mark it for review. A promoted word returns after at least eight intervening independent reading opportunities. Retries, boss dodges and boss choices do not award mastery. The starting band continues to apply to unseen words.

The run starts with three hearts. The following rules apply at every stage, including the arena:

| Wrong choice | What happens | Cost |
| --- | --- | --- |
| Door, including a locked or out-of-order arena exit | The explorer returns to try again. | No hearts |
| Person | The chosen person turns and strikes the explorer. | One heart |
| Chest | The chosen box opens into a toothed mimic and bites. | One heart |
| Food tray, drain lever, sluice, minecart, machine button or signal | The mechanism reacts and the explorer returns. | No hearts |
| Other item | The item's trap strikes the explorer. | One heart |
| Ladder | The rungs give way and the explorer falls to the lower floor. | One heart |
| Bridge | The deck breaks while the explorer is on it; the explorer falls into the chasm. | Run ends immediately |

All bridges and ladders look intact until stepped on. A fallen ladder remains broken for the rest of the room. A choice that spends the last heart ends the run. The boss can still hit the explorer during any movement, including a safe wrong-door attempt.

## Boss arena and timer

The first countdown starts at 03:00 when the pupil finishes crossing the entrance threshold. Completing an ordinary room adds **three seconds**; the timer displays `+3s` when the explorer exits. Once the timer reaches zero, the boss waits behind the next successful exit rather than interrupting reading or retries. The next ordinary room is replaced by a candlelit underground arena.

The arena shows the complete three-step escape instruction from the start: find the ally who has the unlocking phrase, choose the correct seal item, then take the correct door. Three people, three items and three doors remain in fixed places. Only the current step advances the plan. A wrong target uses the penalty in the table even when selected out of sequence. The explorer returns to the original position after surviving a non-exit action; the correct final door leads straight out.

After its entrance and initial reading window, the guardian fires a 224px projectile towards the explorer’s hood. Each shot keeps the direction it had at launch, takes two active seconds to reach its target, and is followed by five seconds of cooldown. A hit costs one heart. When the pupil dodges, the shot speeds up along its original line and leaves the screen. Completing the escape **starts a fresh 03:00 countdown** for the next guardian. Time spent in the arena and bonuses earned before it do not shorten or extend that new countdown. The escape itself and intermediate arena actions do not add a three-second bonus.

## Pacing and saves

Word-specific reading bands adapt to the pupil’s choices. The elapsed run time also affects hazard pacing. A later-stage door mistake never becomes fatal. There is no hard time limit. Newly entered arenas give less initial reading time after eight active minutes. Pausing or switching to a background tab freezes active time. Five minutes is a design target, not a measured classroom median.

Only a correct reward chest pays coins. Each one pays one coin at the start, then one more for every ten dungeon rooms already cleared, up to five. The amount appears beside the coin icon. A restart resets the score and keeps the pupil’s reading history. Older saves keep coins earned in the current run. Reloading resumes the current run, including boss progress, the countdown and any chest reward already credited.

An active revision 13 journey retains its current area itinerary and any promised vault, then joins the mixed draw at the next area. An unfinished older route choice switches to cart dispatch. Saved mounted machines use the button interaction when play resumes. Old treasure doors that have already paid stay paid.

## Artwork and verification

The art includes a dedicated entrance, two ordinary room backdrops plus a chasm and a ledge for each new area, and regional people, containers and guardians. Canvas uses nearest-neighbour rendering. Trap reactions animate the selected sprite, preserving the colours and material that appeared in the reading clue. The [artwork catalogue](assets/dungeon/README.md), [mechanism and teaching sprites](assets/dungeon/LESSON-ART.md), [blocked-path sprites](assets/dungeon/OBSTACLE-ART.md) and [rail and gate sprites](assets/dungeon/RAIL-GATES-ART.md) document the source art and ImageGen prompts.

Run the four checks with `node --test test-dungeon-content.cjs test-dungeon-engine.cjs test-dungeon-ui.cjs test-dungeon-art.cjs`. The UI suite runs game handlers and animation frames in a Node VM. See [verification notes](DUNGEON-QA.md) for coverage and the limits of direct Canvas rendering.
