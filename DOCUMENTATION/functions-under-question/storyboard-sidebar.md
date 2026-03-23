# Storyboard Sidebar

Status: hidden, not deleted

Date: 2026-03-23

Reason:
- The right storyboard sidebar in the screenplay overlay was creating UX noise.
- The current decision is to keep storyboard accessible from a single header button that opens fullscreen.
- The sidebar code remains in the codebase for possible return.

Code kept in:
- `src/components/editor/ScriptWriterOverlay.tsx`
- `src/components/editor/screenplay/StoryboardPanel.tsx`

Current behavior:
- The storyboard sidebar no longer auto-opens.
- The regular right sidebar flow is hidden by default.
- The overlay keeps one `Storyboard` button that opens fullscreen storyboard mode.
- The panel code is preserved in case the sidebar returns later.

If we restore it later:
- Revisit the header controls in `ScriptWriterOverlay.tsx`.
- Revisit auto-open behavior for the overlay storyboard panel.
- Re-evaluate whether the storyboard should return as a sidebar, fullscreen mode, or a dedicated page.