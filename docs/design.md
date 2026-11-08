# Shirube: design

The look is taken from `wireframe-v2.html`. Dark theme only.

## Colour

- Background: black and charcoal greys (`--bg`, `--surface`).
- Text: near-white (`--text`). Secondary text: grey (`--muted`).
- Borders: a dark grey line (`--border`).
- **Blue (`--blue`) is for hits only:** the active item, focus, offers, and the
  primary button. Never for decoration or section headings.
- **Red (`--danger`) is for delete buttons only.** Nothing else is red.

All values live in `public/tokens.css`. No colour appears anywhere else.

## Status: shape and word

Every status shows a shape and its word together. Never colour alone.

| Stage       | Shape                       |
|-------------|-----------------------------|
| To apply    | Dotted grey ring            |
| Applied     | Solid grey ring             |
| Screening   | Solid blue ring             |
| Interview   | Solid blue dot              |
| Offer       | Blue pill                   |
| Rejected    | Filled white dot            |
| No reply    | Dashed grey ring            |
| Skipped     | Hollow square               |
| Stale       | Hollow diamond, with "stale"|

## Layout

- Navbar across the top: SHIRUBE on the left, page links in the middle, the
  account menu on the right.
- Account menu: My profile, Settings, Export backup.
- Page content sits in one dark panel. No blue side block.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48 pixels (`--space-1` to `--space-7`).
- Corners: 10 pixels (`--radius`).
- Maximum page width: 1100 pixels.
- On screens narrower than 700 pixels, the navbar wraps and rows stack.

## Type

- Body text in the system font. Labels and numbers in a monospace font.
- Labels are small and uppercase.

## Words

- Plain words for every label. Short sentences.
- Buttons name the action: "Save job", "Tick applied", "Delete job".
- Delete asks once more before it deletes, and names what goes with it.