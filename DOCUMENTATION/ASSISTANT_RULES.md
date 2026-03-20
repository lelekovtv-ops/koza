# Screenplay Assistant Rules

This document is the single place for tuning assistant behavior for screenplay edits.

## Where it is configured in code

- Runtime rules module: `src/components/editor/screenplay/screenplayAssistantRules.ts`
- Request orchestration: `src/components/editor/screenplay/screenplayAssistant.ts`

## Rule groups

1. Base rules
- Identity and scope.
- Edit only selected fragment.
- Output format constraints.

2. Negative rules
- What assistant must never do.
- No commentary, no extra text, no out-of-range rewrites.

3. Style conditions
- Preserve tone, voice, and language.
- Handle noisy input.
- Keep output as replacement-only text.

## Editing workflow

1. Update wording in `screenplayAssistantRules.ts`.
2. Run quick validation:
- `npx eslint src/components/editor/screenplay/screenplayAssistantRules.ts src/components/editor/screenplay/screenplayAssistant.ts`
3. Smoke-test in editor:
- Select text and run rewrite/fix grammar.
- Confirm assistant returns replacement only.

## Notes for strong language in scripts

- If explicit wording is required for authenticity, keep this requirement in rules as a style condition.
- If model moderation blocks direct output, use placeholder tokens in draft pass and post-replace in local editing flow.
