---
name: "Королевские шахматы"
description: "Клетка и координаты: a compact blue-ink chess workspace."
colors:
  accent-cyan: "#38bdf8"
  accent-ice: "#e0f2fe"
  accent-violet: "#a8b5ff"
  accent-mint: "#2dd4bf"
  accent-rose: "#f43f5e"
  bg-body: "#0a101b"
  bg-surface: "#101a2a"
  bg-surface-elevated: "#142135"
  bg-surface-hover: "#1a2b43"
  border-color: "rgba(148, 174, 201, 0.16)"
  text-primary: "#e8f0f9"
  text-secondary: "#a1b2c8"
  text-muted: "#879bb5"
  board-frame-bg: "#111e2f"
  square-light: "#dce5ec"
  square-dark: "#4d6d85"
  square-selected: "#79b4c4"
  square-last-move: "#709aab"
  button-primary: "#123d54"
  button-primary-hover: "#174c66"
  button-danger: "#3f2030"
  button-danger-hover: "#57263b"
  text-danger: "#ffa0b1"
  text-error: "#fb7185"
  action-online: "#12364c"
  action-online-hover: "#17465f"
  action-records: "#1b2546"
  action-records-hover: "#243159"
  field-bg: "#0c1422"
  mode-bg: "#111d2e"
  mode-selected-bg: "#143044"
  mode-selected-border: "#3b7795"
  tile-light: "#1b455b"
  tile-dark: "#10293c"
typography:
  headline:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 800
    lineHeight: 1.5
  title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.3px"
  body:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    lineHeight: 1.5
  section-title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
    lineHeight: 1.5
  command-title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 600
    lineHeight: 1.3
  command-description:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  notation:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.88rem"
    lineHeight: 1.5
  coordinates:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1
rounded:
  board: "4px"
  compact: "6px"
  control: "8px"
  tile: "9px"
  row: "10px"
  frame: "12px"
  surface: "14px"
  dialog: "16px"
spacing:
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "24": "24px"
components:
  button-primary:
    backgroundColor: "{colors.button-primary}"
    textColor: "{colors.accent-ice}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.button-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.bg-surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.bg-surface-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-danger:
    backgroundColor: "{colors.button-danger}"
    textColor: "{colors.text-danger}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-danger-hover:
    backgroundColor: "{colors.button-danger-hover}"
  command-secondary:
    backgroundColor: "{colors.bg-surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
    typography: "{typography.command-title}"
  command-online:
    backgroundColor: "{colors.action-online}"
    textColor: "{colors.accent-ice}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  command-online-hover:
    backgroundColor: "{colors.action-online-hover}"
  command-records:
    backgroundColor: "{colors.action-records}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  command-records-hover:
    backgroundColor: "{colors.action-records-hover}"
  mode-radio:
    backgroundColor: "{colors.mode-bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.row}"
    padding: "10px"
  mode-radio-selected:
    backgroundColor: "{colors.mode-selected-bg}"
    textColor: "{colors.text-primary}"
  account-input:
    backgroundColor: "{colors.field-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
    width: "100%"
  dialog-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    padding: "12px"
  dialog-tab-active:
    textColor: "{colors.accent-cyan}"
  card-surface:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.surface}"
    padding: "18px"
---

# Design System: Королевские шахматы

## Overview

**Creative North Star: "Клетка и координаты"**

A chess control panel built from deep blue ink surfaces, quiet slate borders and ice-colored text. Small four-square tiles connect the board to actions, player strips and dialogs; restrained cyan marks play and interaction, while violet distinguishes records.

The board remains the main working area. Interface copy is compact, direct and Russian; full-width action rows pair a clear verb with one short explanation. This records the implemented interface and the user-selected prototype direction, rather than a raster composition.

**Key Characteristics:**

- Four-square chess tiles carrying line-drawn SVG icons.
- Tonal blue surfaces, restrained cyan actions and violet records.
- Inter language; JetBrains Mono chess and numeric data.
- Native controls, visible focus, touch layouts and scrollable dialogs.

## Colors

The frontmatter records the source colors. Preserve its existing hex and RGBA forms.

### Primary

- **Cold Cyan / Ice:** interaction borders, selected controls, keyboard focus, active moves and room details; ice text and icons sit on the dark cyan action fills.
- **Cyan action surfaces:** primary and online actions each retain their source fill and hover variant.

### Secondary

- **Record Violet:** the records action and supporting tile treatment.
- **Status Mint:** wins, successful validation and live room status.
- **Alert Rose:** check, error and resignation states, paired with explicit text or iconography.

### Neutral

- **Blue ink surfaces:** body, cards, elevated controls and hover states.
- **Ice-to-slate text:** primary language, explanations and supporting labels.
- **Quiet slate border:** card and control edges.
- **Frost and glacier:** light/dark board squares with opposing coordinate colors; selected and last-move squares have separate state colors.
- **Four-square tile:** the small checker motif; record tiles use the literal violet values in the sidecar snippet.

**The Accent Role Rule.** Use cyan for play, selection and focus; use the violet action treatment for records. Keep neutral controls on blue surfaces.

The sidecar's generated tonal strips are swatch-preview metadata, not approved interface colors. Gradients and translucent state overlays remain CSS rather than invented flat tokens.

## Typography

Inter and its platform sans-serif fallbacks carry the interface. JetBrains Mono carries chess data. There is no separate display face or imposed scale ratio.

- **Headline:** game-result heading (800, 1.6rem, inherited 1.5 line height).
- **Title:** brand (700, 1.2rem, −0.3px tracking); 1.1rem at 640px and 1rem at 380px.
- **Body:** the source family and 1.5 line height; body declares no explicit font size or weight. Components set their own sizes.
- **Section / label:** card heading (700, 0.9rem); form label (600, 0.82rem).
- **Command title / description:** 0.86rem at 600 / 0.75rem at 400, with 1.3 / 1.4 line heights.
- **Notation / count:** 0.88rem / 0.75rem in JetBrains Mono.
- **Coordinates:** 0.72rem at 700, line height 1; 0.65rem at 640px.

**The Data Type Rule.** Use JetBrains Mono for coordinates, moves, counts and room codes; use Inter for interface language.

The HTML loads Inter weights 400–800 and JetBrains Mono 500–600. Some data selectors request 700–800, so browsers may synthesize heavier mono weights. This records the implementation, not a new loading requirement.

## Layout

The centered app is at most 1160px wide, with 28px × 20px page padding and 24px vertical gaps. The desktop game grid is `minmax(360px, 600px) minmax(320px, 1fr)` with a 24px gap. Player strips frame the square board; sidebar cards have a 16px gap. Spacing tokens are observed steps, not an imposed modular scale.

- **1100px:** mode tiles place copy below the tile/check row; the two radio choices remain adjacent.
- **960px:** board and sidebar stack, each centered and capped at 600px.
- **640px:** safe-area-aware page padding; 14px app gap, 16px game gap, 5px board-frame padding and 15px card padding. The header has a flexible turn badge plus three 44px actions; signed-in tools take a full row. Compact action labels hide while accessible names remain. Stats become two columns. Fields use 16px text and principal touch controls reach 44px. Dialog bodies scroll inside viewport-limited shells.
- **380px:** header padding is 10px, cards 12px and the JSON transfer pair stacks.
- **Coarse pointer:** principal buttons, tabs and close/icon controls have 44px minimum targets and `touch-action: manipulation`. With no hover, pieces do not lift.

Major command rows stay single-column. The board uses eight equal `minmax(0, 1fr)` tracks and a 1:1 aspect ratio. Dense history/record tables scroll locally; all eight files fit the phone width.

## Elevation & Depth

Tonal changes and thin borders provide most depth. Cards and command rows have no resting elevation shadow. Existing PNG pieces retain small drop shadows. Focus rings, board-state inset strokes and the promotion hover glow explain state. Board/fullscreen overlays darken and blur the content (8px / 6px).

- **Input focus:** `0 0 0 3px rgba(56, 189, 248, 0.22)` and a cyan border.
- **Selected square:** `inset 0 0 0 2px var(--accent-cyan)`.
- **Promotion hover:** `0 4px 14px rgba(56, 189, 248, 0.25)`.
- **Piece filter:** `drop-shadow(0 3px 5px rgba(0, 0, 0, 0.45))`.

**The State Motion Rule.** Motion explains an interaction or loading state. Command rows stay in place while their chevron moves; there is no ambient animation.

Command/radio transitions use 0.16s ease, player strips 0.18s ease, fields/tabs 0.2s. Dialog entry fades and scales from 0.96. The record refresh icon spins during loading (0.8s linear). Reduced motion removes animations/transitions and restores automatic scrolling.

## Shapes

Soft rectangles have thin borders: 8px control corners, 10px action/radio rows, 14px cards and 16px fullscreen dialogs. Phone cards use 10px corners and dialogs 12px. Compact badges use 6px; the square board has 4px inner corners.

The conic-gradient tile is normally 38px square with 9px corners. Variants: 30px mode choice, 32px small dialog mark, 36px player avatar, 44px brand/profile/records header and 60px result mark. The phone brand tile is 40px. Existing king and chess-piece PNGs remain the artwork.

## Components

### Buttons and command rows

Base buttons use 10px × 14px padding and 0.87rem at 600. Primary is dark cyan, secondary elevated blue, outline transparent and danger rose. Major rows add a tile, two-line copy and a chevron: minimum 62px high, 10px × 12px padding, 12px gap, full container width. Online is cyan; records violet. Hover changes surface/border and moves the chevron 2px right. Pressed command rows use `brightness(1.15)`. Disabled buttons fade to 0.5 with a not-allowed cursor; their arrows stay still.

Buttons, links and selects receive a 2px cyan keyboard outline offset 3px. SVG icons use 1.7 stroke, round caps/joins and no fill. Normal controls use 18px icons; action-tile icons are 19px, mode icons 16px, result icons 30px and chevrons/transfer icons 15px. These are intentional source variants.

### Native choices and fields

Use fieldsets, legends, labels and real radios. The transparent input covers the label tile and retains native keyboard behavior and mutual exclusion. Checked tiles change fill/border, brighten the title and reveal a check. Focus rings the visible tile. Mode choices are at least 64px high; side choices 44px with existing 25px king PNGs. Disabled fieldsets fade to 0.55 with a not-allowed cursor.

Account fields use the inset blue fill, 8px corners, 11px × 14px padding and 0.92rem text. Labels stay visible; placeholders are muted. Focus adds the cyan border/ring. Visible validation messages use mint success, rose error, yellow warning and muted checking. Room codes are centered uppercase mono with 4px tracking. Phone/coarse-pointer fields use 16px text.

### Dialog navigation and containers

Dialog navigation uses real buttons and a 2px active bottom border. Muted labels brighten on hover; active labels/underlines are cyan. Leaderboard categories scroll horizontally when needed. Dialogs share dark bordered shells, distinct header strips and scrolling bodies constrained by `100dvh`; phone close controls are 44px.

Cards have 18px padding. Count badges use cyan mono text on an inset fill (3px × 8px padding, 6px corners). Player strips use 12px corners and 10px × 14px padding; active turn changes fill/border without pulsing. Notation uses mono text, a sticky header, quiet alternating/hover rows and a cyan active move, inside a 240px maximum-height viewport. Noninteractive badges/tables have no button focus or pressed behavior.

## Do's and Don'ts

### Do:

- **Do** reuse the four-square tile and shared SVG line language, including the source-specific size variants.
- **Do** pair major actions with a short description and keep the row full width.
- **Do** preserve native controls, visible focus and disabled states.
- **Do** keep all eight files visible and let long dialogs scroll within the viewport.

### Don't:

- **Don't** replace interface SVG icons with emoji or decorative coordinate labels.
- **Don't** spread violet record styling to ordinary game controls.
- **Don't** animate entire command rows on hover or add idle pulsing.
- **Don't** treat preview tonal ramps or unused legacy variables as approved colors.

Not canonized: unused legacy accent variables and older pulse/emoji-control descriptions in `CONTEXT.md`. Current CSS/SVG assets are the evidence; those older descriptions were not repaired in this documentation-only pass.
