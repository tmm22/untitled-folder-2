## Web Mobile Responsiveness Notes

### Overview
The Narration Studio web views now adapt cleanly to narrow viewports. Padding, typography, and panel controls scale down for phones without disturbing the large-screen layout.

### Key Adjustments
- **Home hero spacing** – Reduced base padding and added responsive typography so the landing headline no longer overwhelms mobile users (`web/src/app/page.tsx`).
- **Studio hero spacing** – Mirrored the responsive tweaks on the studio landing page to keep layout parity (`web/src/app/studio/page.tsx`).
- **Workspace container** – Tightened the Narration Studio panel padding on small screens and allowed its reset button to expand full width for easier taps (`web/src/components/transit/TransitTranscriptionPanel.tsx`).
- **Collapsible controls** – Updated shared panel chrome to wrap labels, actions, and toggles gracefully when horizontal space is limited (`web/src/styles/globals.css`).

### Verification
1. Run `npm run dev` in the `web` workspace.
2. Open the home (`/`) and studio (`/studio`) routes.
3. Inspect the layouts at sub-640px, tablet, and desktop breakpoints (e.g., Chrome DevTools Device Toolbar) to ensure headings, wrap behaviour, and controls remain accessible.

### Follow-Up Ideas
- Audit other panels that rely on multi-column grids (e.g., Premium workspace cards) and add responsive stack behaviour if needed.
- Consider adding automated visual regression checks for the main breakpoints once Playwright coverage expands.
