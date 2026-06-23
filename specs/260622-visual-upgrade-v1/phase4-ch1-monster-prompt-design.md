# Phase 4 Chapter 1 Monster Prompt Design

> Date: 2026-06-23
> Scope: Phase 4 Gold Standard Chapter 1 monsters prompt direction for multi-model comparison
> Related tasks: `GS-CH1-COMMON`, `GS-CH1-ELITE`

## 1. Goal

Define the prompt strategy for Chapter 1 non-boss monsters so the user can compare outputs across multiple image models before selecting final art for review and integration.

This prompt set covers:

- Goblin Warrior
- Goblin Archer
- Flame Goblin Elite
- Frost Goblin Elite

Goblin Chief is excluded from this document because its current UI direction is already accepted by the user.

## 2. Locked Visual Context

The prompts must stay inside the approved Chapter 1 visual identity:

- World identity: bright, warm, readable sky-fantasy tower-garden world
- Chapter 1 identity: goblin outpost occupying floating tower ruins at cloud dusk
- Chapter 1 scene cues: rough wood fences, torn ochre-red flags, horn racks, rope, supply crates, sacks, crude watch structures
- Material family: deep wood, worn leather, dull iron, moss green, warm campfire rim light
- Rendering family: polished Q-version, semi-matte toy feel, thick real outline, mobile-first readability

The monsters must feel compatible with the accepted Goblin Chief, but not copy its weight class or intensity.

## 3. User-Approved Direction

The user approved the following creative direction:

- Priority: more cute and Q-version first
- Secondary emphasis: clearer class and role recognition
- Consistency target: medium consistency with Goblin Chief

Interpretation:

- Same tribe, same world, same outline logic, same material family
- Normal and elite monsters should be lighter, rounder, and more simplified than the boss
- Units should read as gameplay roles at a glance without losing the cute goblin identity

## 4. Prompt Strategy

Each monster gets two prompt tracks in both Chinese and English:

- Track A: Cute-stable baseline
- Track B: Cute baseline plus stronger role readability

Purpose of the two-track structure:

- Track A checks whether a model can hold style consistency and world identity
- Track B checks whether a model can keep the same style while increasing gameplay readability

This is intentionally not a high-variance exploration system. The two tracks should remain comparable and only shift emphasis, not change art family.

## 5. Shared Hard Constraints

Every prompt should enforce:

- single subject
- transparent background
- no ground, pedestal, platform, or shadow base
- thick real dark outline, not fake edge shadow only
- readable at small mobile size
- stylized toy-like semi-matte rendering
- must clearly read as Chapter 1 goblin tribe

Every prompt should avoid:

- photorealism
- horror
- gore
- demon or beast traits
- generic dungeon monster styling
- human teenager proportions
- overcrowded special effects
- text, logo, watermark

## 6. Monster Anchors

### 6.1 Goblin Warrior

Design intent:

- The most basic frontline tribe soldier
- Shortest and roundest of the four
- Feels like a summonable grunt from the Goblin Chief

Key silhouette anchors:

- broken dull iron helmet
- short rusty sword and/or tiny wooden shield
- squat forward-leaning pose
- mischievous but not cruel expression

### 6.2 Goblin Archer

Design intent:

- A distinct ranged unit, not a warrior with a bow swap
- Lighter and more alert than the warrior
- Still clearly part of the same tribe

Key silhouette anchors:

- crude short bow
- tattered hood or cloth cap
- tucked shoulders, alert stance
- smaller and nimbler role read

### 6.3 Flame Goblin Elite

Design intent:

- Elite goblin first, flame-element variant second
- Stronger presence without becoming a fire elemental

Key silhouette anchors:

- thicker outline and slightly larger body than normal monsters
- warm ember or lava-red accents
- charred cloth or scorched armor pieces
- compact flame markers kept secondary to the goblin body

### 6.4 Frost Goblin Elite

Design intent:

- Elite goblin first, frost-element variant second
- Visual counterpoint to Flame Goblin Elite

Key silhouette anchors:

- thicker outline and slightly larger body than normal monsters
- frost-blue or icy-white accents
- frosted armor bits or crystal trinkets
- controlled cold aura or small ice crystal markers

## 7. Success Criteria

Prompt output is considered successful when:

- all four units read as the same Chapter 1 tribe
- warrior and archer separate cleanly by silhouette and stance
- flame and frost elites separate cleanly by role markers and temperature cues
- all units remain cute-readable rather than scary or realistic
- the outline remains clear enough for later small-size review

## 8. Risks To Guard Against

- outputs become generic green monsters instead of Chapter 1 goblins
- elite variants become elemental blobs with weak goblin identity
- archer and warrior differ only by weapon, not overall read
- models fake outline with dark shading instead of a clean border
- cute direction collapses into sticker-like baby art with no threat

## 9. Deliverable Shape

After this design is approved, the next deliverable should contain:

- four monsters
- two prompt tracks per monster
- Chinese and English versions for each track
- one shared negative prompt block
- one shared technical suffix block
- short usage notes for multi-model comparison
