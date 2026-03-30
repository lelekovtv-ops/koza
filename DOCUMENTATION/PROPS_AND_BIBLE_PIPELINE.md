# Props & Bible Pipeline — Architecture

## Overview

System for parsing, managing, and injecting characters, locations, and props from the screenplay into image/video generation prompts.

---

## 1. Parsing (bibleParser.ts)

### Characters
- Parsed from `character` type blocks in screenplay
- Linked to scenes via `linkCharactersToScenes()`
- Fields: `name`, `description`, `appearancePrompt`, `sceneIds[]`, `generatedPortraitUrl`, `referenceImages[]`

### Locations
- Parsed from `scene_heading` blocks (INT./EXT. format)
- Auto-extracted: `intExt`, `timeOfDay`, `fullHeading`
- Fields: `name`, `description`, `appearancePrompt`, `sceneIds[]`, `generatedImageUrl`, `referenceImages[]`

### Props (regex-based)
- Parsed from `action` blocks using `PROP_PATTERNS` — regex patterns for Russian words:
  - Transport: машина, автомобиль, фургон, такси, мотоцикл
  - Weapons: пистолет, нож, ружьё, револьвер
  - Communications: телефон, трубка, смартфон
  - Documents: документы, бумаги, письмо, конверт, паспорт
  - Furniture: пепельница, стакан, стол, стул, кресло, диван
  - Electronics: телевизор, экран, монитор, компьютер, камера
  - Clothing: куртка, пальто, очки, сумка, ключи
  - Food/drink: сигарета, кофе, бокал
  - Environment: дверь, окно, шторы, лестница
- Normalized to nominative case via `normalizePropName()`
- Auto-description: `extractSentence()` pulls context from action blocks where prop is mentioned

### Smart Scan (AI-based, non-obvious props)
- Button "Smart Scan" on Props tab or Scene Bible modal
- Sends action blocks to LLM with prompt: "find hidden props implied by context"
- Example: "девушка едет в машине" → руль, приборная панель, зеркало заднего вида
- Results shown as suggestions with Accept/Dismiss
- Accepted props added to Bible store with `addProp()`
- Works per-scene in Scene Bible modal, or globally in Bible page

---

## 2. Storage (store/bible.ts)

### Zustand store `useBibleStore`
- `characters: CharacterEntry[]`
- `locations: LocationEntry[]`
- `props: PropEntry[]`
- `storyHistory: string` — project backstory for context
- `directorVision: string` — visual philosophy

### Persistence
- All three arrays persisted to localStorage (`koza-bible-v1`)
- On rehydration: blob URLs restored from IndexedDB via `restorePrimaryImage()`
- `updateFromScreenplay(blocks, scenes)` — re-parses and merges (preserves user edits)

### Key methods
- `updateCharacter/Location/Prop(id, patch)` — update fields
- `addProp(prop)` — add new (with dedup)
- `removeProp(id)` — delete

---

## 3. Prompt Injection (promptBuilder.ts)

### Matching entities to shots

**Characters** — `getCharactersForShot(shot, characters)`:
1. Text match: character name mentioned in shot caption/notes/prompts
2. Fallback: all characters linked to the shot's scene

**Locations** — `getLocationsForShot(shot, locations)`:
1. Primary: location whose sceneIds includes shot's sceneId
2. Secondary: location name mentioned in shot text

**Props** — `getPropsForShot(shot, props)`:
1. Text match: prop name (or stem) found in shot text
2. Fallback: all props linked to the shot's scene

### Formatting in prompt

Characters: `БОРИС — джуд лоу; АННА — молодая женщина`
Environment: `квартира в стиле фильма бойцовский клуб`
Props: `Стол — стол для сценариста; Телевизор — старый кинескопный`

### Visual anchors
If character/location has generated image or reference images:
- "Preserve character identity from visual references."
- "Preserve environment from visual references."
- Reference images sent as data URLs alongside prompt

### Where prompts are built
- `buildImagePrompt()` — for image generation (PHOTO button)
- `buildVideoPrompt()` — for video generation (VIDEO button)
- `buildScenePromptDrafts()` — batch for all shots in a scene (PROMPTS button)
- `buildBreakdownBibleContext()` — context for AI breakdown engine

---

## 4. Bible UI Locations

### Bible Page (/bible)
- Full management: generate images, upload, edit prompts, reference images
- Tabs: Characters, Locations, Props
- Smart Scan button for AI prop discovery
- Scene badges (S1, S3) on each card
- Sorted by first scene appearance

### Scene Bible Modal (in StoryboardPanel)
- Opened via BookOpen icon on scene bar
- Shows characters/locations/props for ONE scene
- Can generate, upload, edit prompts inline
- Can remove entities from scene
- Smart Scan for that specific scene
- Grid 4 columns

### Prompt overlay (in ShotStudio)
- Bottom of image: shows final prompt text
- Bible entity names highlighted in gold
- Reference thumbnails shown above prompt text

---

## 5. Data Flow Diagram

```
Screenplay blocks
      |
      v
bibleParser.ts ──────> Characters, Locations, Props (regex)
      |
      v
useBibleStore ──────> localStorage + IndexedDB (images)
      |
      v
promptBuilder.ts
  - getCharactersForShot()  ──> match by name or scene
  - getLocationsForShot()   ──> match by scene or mention
  - getPropsForShot()       ──> match by name or scene
      |
      v
buildImagePrompt() / buildVideoPrompt()
  - Injects: Characters, Environment, Props
  - Adds: visual anchor instructions if images exist
      |
      v
Image/Video Generation API (Nano Banana / GPT Image)
```

---

## 6. Auto-translation

When model is GPT Image (doesn't understand Russian well):
- `translateToEnglish()` called before `buildPrompt()`
- Uses `/api/chat` LLM to translate appearance prompt
- Nano Banana models receive Russian as-is

---

## 7. Generation Settings

- Reference images: only user-uploaded refs sent (not previous generations)
- This allows prompt changes to take effect (e.g., changing actor from "Putin" to "Jude Law")
- Props prompt includes: "Uniform dark background, no distracting elements"
- Character prompt includes: identity preservation instructions
- Location prompt includes: "No text. No people."
