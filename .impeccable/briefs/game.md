# Chess workspace

Mode: Operate. Entry: `index.html`. Product and behavior: `CONTEXT.md` and the existing controllers.

## Direction contract

THESIS: Carry the user-selected «Клетка и координаты» control-panel concept across the existing chess interface. Keep the board the primary working area and preserve all existing game, bot, account, room, import/export and record flows.

OWN-WORLD: Deep blue ink surfaces, quiet slate borders, ice-colored text, restrained cyan actions and violet records. The signature is a small four-square chess tile carrying a consistent 18px line icon. Inter for interface text; JetBrains Mono only for coordinates, moves, counts and room codes.

STORY: Recognize the board and whose move it is; start or resume a local, bot or online game; access records and account tools through familiar buttons and dialogs.

FIRST VIEWPORT: Existing header over board-and-sidebar layout. Player strips frame the large board. The sidebar has native game settings and four full-width action rows with a tile at left, action and short explanation in the middle, a restrained chevron at right. Import/export is a compact pair below. History and rules follow.

FORM: seed: none (pinned). User: «мне второй варик больш нравится … сделаем в таком духе интерфейс». Approved reference: `button-variants.html`, variant «Клетка и координаты» in the conversation's visualization directory. Extend its motif to the header, player strips, dialogs and tables, without introducing decorative coordinate labels or invented state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Interaction and responsive behavior

Use native buttons, radio groups, labels and inputs. Preserve controller IDs. Hover changes border/surface and nudges only the icon, not the entire row; visible keyboard focus and pressed states are required. No ambient animation. Honor reduced motion. Stack the board and sidebar under 960px, keep all eight files visible at 320px, keep controls usable by touch, and let dialog content scroll within the viewport.
