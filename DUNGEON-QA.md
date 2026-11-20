# Dungeon verification

Run the four shipped suites from the game folder with `node --test test-dungeon-content.cjs test-dungeon-engine.cjs test-dungeon-ui.cjs test-dungeon-art.cjs`.

## Current release

The suites cover the run-only coin score, chest payouts from one to five coins, and repeatable reloads during chest opening. The game retains coins earned during an active run when it upgrades an older save. Starting a new run resets the coin score.

## Earlier button and dispatch checks

The UI tests operate a mounted machine and dispatch a minecart using the ordinary target buttons. They check initial and failed door states, the machine response before departure, retained objects and one completion bonus. The art suite exercises the visible markings, movements and horizontal rails.

A playthrough of the served scripts cleared 5,760 rooms across 120 runs. Every stage offered one correct action. Button consoles and cart dispatch appeared in all eight areas. Revision 13 saves for an ice-fort fork, an observatory cart and an alternating-stripe star panel were reopened through the app handlers. Each allowed a wrong attempt followed by a successful clear with its wallet and clock preserved. A separate engine audit checked 46,500 snapshots from revisions 10, 12, 13, 14 and 15.

## Two-step room checks

The UI tests choose a wrong miner, talk to the right one, retry a lever, and leave the room while a guardian is due. They also open a feeding record and use the tray controls. They check which targets accept clicks, the clue text after contact, the explorer’s position after reload, and a single countdown bonus on departure.

A separate engine simulation played 12,000 rooms over 200 runs and restored 5,944 in-room clue changes. Two-step quests accounted for 0% of the first two rooms, 24% of rooms 3–8, 46% of rooms 9–18 and 56% of rooms 19–60. The simulation observed no standalone door selections. These are generated encounter frequencies.

## Mixed rooms, carts and exits

Revision 14 testing played through its shuffled activity sets, route forks and paid treasure rooms, then tried the checkpoint and the final door. A 21,600-room simulation checked 1,280 full twelve-activity rotations and 2,012 area changes. Every complete rotation contained both chests and forks. Bonus chests preserved the next scheduled activity and the final checkpoint, including when a guardian was due at a vault fork. A separate migration check restored 11,564 genuine revision 13 snapshots. Existing journeys preserved their previous area plan and promised vault.

UI tests cover wrong attempts, correct actions, pause, reload, all three blocked-path rooms and the two-stage area exit. They check the visible door remains closed during a wrong choice and opens during a successful departure. The art tests check the side-view cart and rail, door leaves and stone-room placement. Native Canvas renders use the shipped sprite sheets and area artwork.

## Blocked paths

The UI tests use the real click handlers and animation frames to try both wrong responses and the working control in each room. They check that the character stops beside the control, the obstacle reacts before the automatic exit, pauses freeze the response, and a retry preserves health, wallet and room credit. Reloading during a successful action settles it once. A waiting guardian only appears after the world changes and the explorer leaves.

Revision 13 compatibility checks include its early blocked paths. It included the brief two-choice directions and longer instructions. Another simulation reached all 31 existing vocabulary targets in each of the eight areas with the new itinerary. Script-order checks loaded the browser versions of the served files and played through the entrance into an ordinary encounter.

## Reading and working mechanisms

The content tests check that every assessed word can appear in each of the eight areas at each starting band. Each board has exactly one answer and a near miss for each essential condition. A simulated successful pupil reached the highest band for all 31 words over 6,000 room visits and 30 restarts. That exercise verifies reachability. Classroom pacing and attainment still need pupil playtesting.

The UI checks exercise the actual input handlers and animation frames. They enter a fresh dungeon, activate each kind of working mechanism, pause during an operation and retry the same room. A wrong setting leaves the heart count and wallet unchanged. The correct setting shows the machinery move and carries the explorer onward. A corrected retry never creates a second reading score. A pupil who missed a supporting detail receives a hint about that detail. Earlier releases also tested profile switching and separate wallets.

The art suite checks the layouts for two, three and four stations across all eight areas. It checks the lit and unlit fittings, moving equipment, regional object and mounting layers, and interaction paths. A separate render exercise drew production PNGs on a native Canvas, including the sluice stream, an older cart mechanism, drum signals and eight kinds of teaching object. Touch interaction and CSS layout still need an on-device playtest.

## Compatibility and game rules

Migration checks restored 10,702 revision 12 snapshots, including 2,541 chest snapshots and 1,680 arena snapshots, and 3,808 revision 10 snapshots. It verified current choices, wallet, health, time and existing boss plans. Those earlier releases tested a fixed five-coin reward and a banked balance.

Regression checks cover all nine arena targets, the three-step escape plan, hood contact, fixed shot angle, two seconds of flight, five seconds of cooldown and a fresh three-minute countdown on escape. Ordinary clears award the three-second delay. Walking through doors is continuous. People and floor items use a stop beside their sprite. Tests still cover wrong-person attacks, mimic bites, ladder falls, fatal bridge collapses and one-time chest rewards.
