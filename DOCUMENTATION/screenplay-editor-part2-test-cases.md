# Screenplay Editor Part 2 Test Cases

Hybrid Pro validation checklist for 18 behavior rules.

## 1. Default
- Open new screenplay page.
- Expected: first block type is Action; caret is in Action at offset 0.

## 2. Enter Routing
- In Action with text, press Enter.
- Expected: next block type is Action.

- In Scene Heading with text, press Enter.
- Expected: next block type is Action.

- In Character with text, press Enter.
- Expected: next block type is Dialogue.

- In Dialogue with text, press Enter.
- Expected: next block type is Character.

- In Parenthetical with text, press Enter.
- Expected: next block type is Dialogue.

- In empty Dialogue, press Enter.
- Expected: current block converts to Action (exit dialogue chain).

## 3. Tab Behavior
- In empty Action, press Tab.
- Expected: Action -> Character.

- In empty Character, press Tab.
- Expected: Character -> Action.

- In filled Character, press Tab.
- Expected: inserts Parenthetical block below with "(" and caret after "(".

- In Scene Heading without separator, press Tab.
- Expected: inserts " — " once.

- In Scene Heading with separator already present, press Tab.
- Expected: no duplicate separator.

- In other blocks, press Tab.
- Expected: fallback cycle still works (Hybrid Pro).

## 4. Live Conversion in Action
- Type "int. " in Action.
- Expected: block auto-converts to Scene Heading.

- Type "ext. " in Action.
- Expected: block auto-converts to Scene Heading.

- Type "инт. " in Action.
- Expected: block auto-converts to Scene Heading.

- Type "экст. " in Action.
- Expected: block auto-converts to Scene Heading.

## 5. Ghost Slug Suggestion
- In Action, type "e".
- Expected: ghost shows Tab -> EXT.

- In Action, type "ин".
- Expected: ghost shows Tab -> ИНТ.

- Press Tab at end of the Action line.
- Expected: line becomes full slug + trailing space; block converts to Scene Heading.

## 6. Parenthetical Trigger
- In empty Dialogue at offset 0, type "(".
- Expected: block converts to Parenthetical and keeps "(".

## 7. Autocomplete: Character
- Enter at least two distinct Character names.
- Create Character block, type prefix of known name.
- Expected: suggestions dropdown appears.

- With dropdown open, press ArrowDown/ArrowUp.
- Expected: active suggestion changes.

- Press Enter.
- Expected: selected suggestion applied to current Character line.

- Press Tab.
- Expected: selected suggestion applied (autocomplete priority).

## 8. Autocomplete: Scene Heading Location
- Create a few Scene Headings with distinct locations.
- In new Scene Heading, type prefix of known location after prefix (e.g. INT. KIT).
- Expected: location suggestions dropdown appears.

- Accept suggestion by Enter/Tab.
- Expected: location is replaced, prefix preserved.

## 9. Autocomplete: Time of Day
- In Scene Heading, insert separator " — " or " - ".
- Type prefix of time token (e.g. N, Н).
- Expected: time suggestions dropdown appears.

- Accept by Enter/Tab.
- Expected: time segment replaced; location and prefix preserved.

## 10. Backspace Behavior
- In empty block (not first), press Backspace.
- Expected: block removed; caret moves to end of previous block.

- In non-empty block, press Backspace.
- Expected: default character deletion.

- In Scene Heading with INT./EXT./ИНТ./ЭКСТ. prefix and caret within prefix zone, press Backspace once.
- Expected: entire prefix removed in one action, block converts to Action.

## 11. Auto-caps
- In Scene Heading, type lowercase letters.
- Expected: inserted text is uppercase.

- In Character, type lowercase letters.
- Expected: inserted text is uppercase.

- In Transition, type lowercase letters.
- Expected: inserted text is uppercase.

- Repeat with Cyrillic letters.
- Expected: uppercase transformation also works.

## 12. Priority Rules
- Open autocomplete suggestions and press Enter/Tab.
- Expected: autocomplete acceptance has priority over default Enter/Tab block logic.

- Open autocomplete suggestions and press Escape.
- Expected: suggestions close without applying value.
