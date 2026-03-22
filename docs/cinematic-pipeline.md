# KOZA Cinematic Pipeline - Core Rules & Architecture

## 1. Main Principle

The system does not generate shots.
The system builds a sequential visual reality.

Each shot:
- depends on the previous shot
- prepares the next shot
- obeys the shared world state of the scene

## 2. Pipeline Architecture

The pipeline is strictly linear:

`Scene`
`-> Scene Analyst`
`-> Shot Planner`
`-> Continuity Supervisor`
`-> Shot Relations`
`-> Prompt Composer`
`-> Output (JenkinsShot[])`

Roles must not be mixed.
Each layer is responsible only for its own work.

## 3. Component Roles

### Scene Analyst

Task:
- understand the scene as drama

Output:
- beats
- tone
- space
- characters
- motifs

Forbidden:
- does not create shots
- does not write prompts

### Shot Planner

Task:
- break the scene into a sequence of shots

Output:
- `ShotSpec[]`

Each `ShotSpec` is:
- a self-sufficient shot
- but already part of a sequence

Forbidden:
- does not deeply manage previous-shot continuity
- does not own world consistency

### Continuity Supervisor

Task:
- preserve the world between shots

Adds:
- `ShotMemory`
- `carryOver`
- `setupForNext`
- `continuityWarnings`
- `lockedAnchors`

This is the film memory.

### Shot Relations

Task:
- define how shots connect

Adds:
- `relationType` as form
- `relationIntent` as meaning

Examples:
- `insert -> focus_shift`
- `reverse -> dialogue/reaction`
- `cut_on_action -> action_continuation`

This is the editing logic.

### Prompt Composer

Task:
- translate structured planning data into prompts

Uses:
- `ShotSpec`
- continuity data
- relations data

Rule:
- does not invent
- only translates

## 4. Continuity Memory

Each shot stores:
- characters
- wardrobe
- props
- location
- lighting
- palette
- composition
- direction of movement
- eyeline
- axis of action

Main rule:
- the next shot does not recreate the world
- it continues the world

## 5. Prompt Composer Rule

Every prompt must be structured as:

### PRESERVE

What must not change.

### CHANGE

What changed in this shot.

### PREPARE

What is being prepared for the next shot.

### DO NOT

What the model must not alter.

## 6. Keyframe Rule

Not all shots are equal.

Shot types:
- key shot
- secondary shot
- insert

Key shot sets the world:
- first wide shot
- first appearance of a character
- new location

Rule:
- key shots are generated first
- all other shots follow them

## 7. Shot Relations Rule

Each shot must be linked to the previous shot.

Required fields:
- `from`
- `to`
- `type`
- `intent`
- `reason`
- `constraints`

Example:

```yaml
type: insert
intent: focus_shift
reason: attention moves from character to object
```

## 8. Why the System Breaks

If continuity breaks, check in this order:

1. Continuity was not passed forward.
   Check `carryOver`.
2. Prompt Composer ignored constraints.
   Check the `PRESERVE` block.
3. Shot Planner created incompatible shots.
   Check sequence logic.
4. There is no keyframe anchor.
   The scene starts drifting.

## 9. Hard Prohibitions

- Do not generate a shot without previous context.
- Do not write a prompt without continuity.
- Do not ignore relations.
- Do not mix module responsibilities.
- Do not let the model freely alter the world.

## 10. Stability Rule

Stability equals:

`strong ShotSpec + continuity memory + relations + strict prompt`

## 11. Operating Modes

### Fast Mode

- no image analysis
- structured memory only

### Advanced Mode

- image to memory extraction
- anchor locking

## 12. Debug Console

Always inspect:
- Scene Analysis
- Shot Plan
- Continuity
- Relations
- Prompts

## 13. Final Formula

Not:

`prompt -> image`

But:

`world state -> shot logic -> continuity -> relation -> prompt -> image`

## Core Mental Model

You are not building a generator.
You are building a cinema engine.

## Why It Looks Good First and Then Breaks

Most likely:
- the first shots behaved like key shots
- then the system lost an anchor
- or continuity weakened
- or the prompt became too permissive

## Repository Invariant

Any pipeline change must preserve the principles in this document.
If a change weakens continuity, relations, key-shot anchoring, or prompt strictness, it is an architectural regression.