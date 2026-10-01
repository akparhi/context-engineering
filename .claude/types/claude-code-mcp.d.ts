// The inputs of the MCP tools this session had, from each server's tools/list
// inputSchema; written by `/plugin-types` (src/plugins/functionHooks/mcp-tool-types/mcp-tool-declarations.ts).
// Merges into the engine's ToolCallInput (types/ McpToolInputs) so
// `e.tool === "mcp__<server>__<tool>"` narrows to the tool's arguments.
// Regenerate rather than edit.
export {}
declare module 'claude-code' {
  interface McpToolInputs {
    /** Get the errors, warnings and other diagnostics VS Code currently shows in its Problems panel, including those for unsaved changes in open editors. Returns a JSON array with one entry per file. Pass `uri` to check one file, or omit it to get every file VS Code currently has diagnostics for. Many language extensions only analyze open files, so a missing file or an empty list can mean the file has not been checked, not that it is clean. */
    "mcp__claude-vscode__getDiagnostics": {
      /** file:// URI of the one file to check. Omit to get every file VS Code currently has diagnostics for. */
      uri?: string
    }
    /** Add a clickable link node for a URL or a local file/folder path. */
    mcp__whitespace__add_link: {
      /** Optional y */
      y?: number
      /** URL (https://...) or absolute file path */
      target: string
      /** Optional x (defaults to view center) */
      x?: number
      /** Display name */
      name?: string
    }
    /** Manage boards (tabs). Actions: list (indexes, current board), switch, new, rename, duplicate (lands on the copy), close (permanent — cannot be undone). */
    mcp__whitespace__boards: {
      /** Board index (0-based, from 'list') for switch/rename/duplicate/close */
      index?: number
      /** Board name, for new and rename */
      name?: string
      /** What to do */
      action: "list" | "switch" | "new" | "rename" | "duplicate" | "close"
    }
    /** Draw ONE arrow or line — for whole diagrams use create_diagram (edges come free with the layout) or import_elements. EITHER give startElementId/endElementId to connect two elements — a real id OR a `ref` you assigned to a shape in this same response (the arrow binds and follows) — OR give explicit startX/startY/endX/endY points. */
    mcp__whitespace__create_arrow: {
      /** Id of the element the arrow starts from */
      startElementId?: string
      /** Explicit start y */
      startY?: number
      /** 0–100 (default 100) */
      opacity?: number
      /** Explicit end y */
      endY?: number
      /** Explicit end x */
      endX?: number
      /** Explicit start x */
      startX?: number
      /** arrow (default) or plain line */
      style?: "arrow" | "line"
      /** 0 = one crisp stroke (clean, diagram look); 1 = doubled sketch stroke (default) */
      roughness?: number
      /** Connector geometry: straight (default, short direct hops), curved (organic flows, avoids crossings), elbow (right-angle, structured diagrams like org charts and system architecture) */
      bend?: "straight" | "curved" | "elbow"
      /** Line width in points (default 2) */
      strokeWidth?: number
      /** Head at the start (default none); crowfoot_* for ER cardinality */
      startArrowhead?: "none" | "arrow" | "bar" | "dot" | "circle" | "circle_outline" | "triangle" | "triangle_outline" | "diamond" | "diamond_outline" | "cross" | "crowfoot_one" | "crowfoot_many" | "crowfoot_one_or_many" | "crowfoot_zero_or_one" | "crowfoot_zero_or_many"
      /** Id of the element the arrow points to */
      endElementId?: string
      /** Optional hex color (strokeColor also accepted) */
      color?: string
      /** Head at the end (default arrow, none for style line) */
      endArrowhead?: "none" | "arrow" | "bar" | "dot" | "circle" | "circle_outline" | "triangle" | "triangle_outline" | "diamond" | "diamond_outline" | "cross" | "crowfoot_one" | "crowfoot_many" | "crowfoot_one_or_many" | "crowfoot_zero_or_one" | "crowfoot_zero_or_many"
      /** Line style — dashed reads as async/optional flow (default solid) */
      strokeStyle?: "solid" | "dashed" | "dotted"
      /** Optional short text riding the arrow's midpoint (e.g. 'yes', 'on miss') */
      label?: string
    }
    /** Create a hand-drawn chart from tabular data. Data is tab- or comma-separated with an optional header row, e.g. 'Month\tRevenue\nJan\t52\nFeb\t61'. */
    mcp__whitespace__create_chart: {
      /** Optional center x */
      x?: number
      /** TSV/CSV data */
      data: string
      /** Chart type */
      chartType: "bar" | "line" | "hbar" | "step" | "scatter" | "lollipop"
      /** Optional center y */
      y?: number
    }
    /** THE DEFAULT way to draw any graph — ONE call, no coordinates; the engine solves layout. Mermaid text, one statement per line. 'flowchart TD' (or LR). Nodes: A[Rect] B(Rounded) C((Circle)) D{Decision} E([Stadium]) F[[Subroutine]] G[(Database)] H{{Hexagon}} I[/Parallelogram/]. Edges: A --> B, A --- B, A -.-> B (dashed), A ==> B (thick), A <--> B, A --o B, A --x B, A -->|label| B, A & B --> C, A ~~~ B (layout only). Colors: classDef api fill:#ebfbee,stroke:#2f9e44 then A:::api or class A,B api; style A fill:#ffc9c9. Palette fill/stroke pairs: #a5d8ff/#1971c2 #b2f2bb/#2f9e44 #ffec99/#f08c00 #ffc9c9/#e03131 #d0bfff/#7048e8 #ffd8a8/#e8590c. Icons: A[Orders API]@{icon: server}, U@{icon: user, label: "Customer"}; database queue cache cloud user server load-balancer browser mobile bucket function gateway. 'subgraph Name' ... 'end' = titled frame; a '%% swimlanes' line makes subgraphs lanes (use LR for process flows). 'sequenceDiagram': participant/actor X as Label, A->>B: msg, -->> reply, -) async, -x lost, +/- activation, Note right of A: txt, loop/alt/else/opt/par/and/critical/break ... end, autonumber. 'erDiagram': A ||--o{ B : label (|o || }o }| cardinality, .. dashed), A { type name PK "comment" }. Unknown statements come back as warnings. The result is scaled to fit the view and placed at its center or the nearest free spot. */
    mcp__whitespace__create_diagram: {
      /** The diagram source text (see syntax in the tool description) */
      source: string
      /** Optional center y */
      y?: number
      /** clean (default): crisp single strokes, SF Pro; sketch: hand-drawn strokes and font */
      style?: "clean" | "sketch"
      /** Optional center x (defaults to a free spot in view) */
      x?: number
      /** Scale down to fit the visible area (default true; never scales up) */
      fit?: boolean
    }
    /** Create a titled frame (a named region that groups what's inside it). */
    mcp__whitespace__create_frame: {
      /** Optional short handle to reference this from arrows in the same response */
      ref?: string
      /** Width */
      width: number
      /** Frame title */
      title?: string
      /** Height */
      height: number
      /** Top-left x */
      x: number
      /** Top-left y */
      y: number
    }
    /** Draw a freehand pen stroke through the given points, like hand-drawing. */
    mcp__whitespace__create_freedraw: {
      /** Optional hex color (strokeColor also accepted) */
      color?: string
      /** Array of [x,y] pairs in scene points */
      points: number[][]
    }
    /** LAST RESORT — draw ONE shape. For any multi-element drawing use create_diagram (graphs; layout is computed for you) or import_elements (exact scenes as one JSON array) instead of chaining create_* calls. Coordinates are scene points, y grows downward; (x,y) is the TOP-LEFT corner. Use the label parameter for text inside the shape. Give a short unique `ref` and you can connect this shape with create_arrow in the SAME response — no need to wait for the id. */
    mcp__whitespace__create_shape: {
      /** Font: 1 Hand-drawn, 9 Chalkboard, 7 Noteworthy, 6 Marker Felt, 2 Helvetica, 10 Avenir Next, 11 Georgia, 5 Futura, 8 Snell Roundhand, 3 Menlo (code), 12 SF Pro, 13 SF Mono */
      fontFamily?: number
      /** 0 = one crisp stroke (clean, diagram look); 1 = doubled sketch stroke (default) */
      roughness?: number
      /** Optional outline hex like #1e1e1e (#rrggbbaa for alpha), or 'transparent' for no outline */
      strokeColor?: string
      /** Outline style (default solid) */
      strokeStyle?: "solid" | "dashed" | "dotted"
      /** Label text color (default ink) */
      labelColor?: string
      /** Optional short handle (e.g. 'client') to reference this shape from arrows in the same response */
      ref?: string
      /** Shape kind */
      shape: "rectangle" | "ellipse" | "diamond"
      /** Optional fill hex like #a5d8ff or #a5d8ff80, or 'transparent' */
      backgroundColor?: string
      /** 0–100 (default 100) */
      opacity?: number
      /** Gradient direction in degrees: 0 = left→right, 90 = top→bottom (default 90) */
      gradientAngle?: number
      /** Top-left y */
      y: number
      /** Rounded corners (rectangles) */
      rounded?: boolean
      /** Label size (default 16) */
      fontSize?: number
      /** Optional text centered inside the shape */
      label?: string
      /** Optional second fill hex — fills with a linear gradient from backgroundColor to this color */
      backgroundGradient?: string
      /** Rotation in radians */
      angle?: number
      /** Fill pattern (default solid) */
      fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag"
      /** Top-left x */
      x: number
      /** Width in points */
      width: number
      /** Height in points */
      height: number
      /** Outline width in points (default 2) */
      strokeWidth?: number
    }
    /** Create a hand-drawn table from tabular data (TSV/CSV, first row = header). */
    mcp__whitespace__create_table: {
      /** Optional center x */
      x?: number
      /** TSV/CSV data */
      data: string
      /** Optional center y */
      y?: number
    }
    /** Place ONE free-standing text element (not inside a shape — use a shape label for that). For scenes with several texts/shapes, use create_diagram or import_elements instead. */
    mcp__whitespace__create_text: {
      /** Font: 1 Hand-drawn, 9 Chalkboard, 7 Noteworthy, 6 Marker Felt, 2 Helvetica, 10 Avenir Next, 11 Georgia, 5 Futura, 8 Snell Roundhand, 3 Menlo (code), 12 SF Pro, 13 SF Mono */
      fontFamily?: number
      /** The text */
      text: string
      /** Optional size, default 20 */
      fontSize?: number
      /** Optional hex color (strokeColor also accepted) */
      color?: string
      /** Rotation in radians */
      angle?: number
      /** Top-left y */
      y: number
      /** Top-left x */
      x: number
      /** Fixed box width: text wraps to it and textAlign aligns within it */
      width?: number
      /** 0–100 (default 100) */
      opacity?: number
      /** Fill pattern (default solid) */
      fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag"
      /** Alignment within width (default left) */
      textAlign?: "left" | "center" | "right"
    }
    /** Delete elements from the board by id or group id (deletes every member). Shapes take their labels along. */
    mcp__whitespace__delete_elements: {
      /** Element or group ids to delete */
      ids: string[]
    }
    /** Read the current board: viewport (the scene rect on screen: x, y, w, h, zoom — place new content inside it), center, selection, and every element back-to-front (later entries draw on top) with its id, type, position, size, text, links, frame, and non-default style (stroke, bg, opacity, font, fontSize, heads, roughness). Multi-element composites (stencils, charts, tables) are collapsed to one `group` entry each with a union bounding box — pass `expand` with a group id to list that group's members individually. Call this FIRST whenever you need to know what's on the board or before editing existing elements. */
    mcp__whitespace__get_board: {
      /** Region width */
      width?: number
      /** Region height */
      height?: number
      /** Optional group id from a previous get_board — expands that one group into its member elements */
      expand?: string
      /** Optional region filter: only elements intersecting x/y/width/height (beats the 150-element cap) */
      x?: number
      /** Region top */
      y?: number
    }
    /** One call for any non-graph scene (illustrations, custom layouts): an array of elements, back-to-front. Fields: type (rectangle|ellipse|diamond|line|arrow|text|path|image|frame|freedraw), id, x, y, width, height, angle (rad), strokeColor (also the text color), backgroundColor, gradient {type:linear|radial, angle (deg, 90 = top→bottom), cx/cy/r (radial, 0–1 of the box), stops:["#hex" or {at:0–1,color}]} (backgroundGradient + gradientAngle = 2-stop shorthand; hachure strokes take it too), fillStyle (solid|hachure|cross-hatch|zigzag), strokeWidth, strokeStyle, opacity (0–100), roughness (0 crisp|1 sketch, default 1), roundness {type:3, value: max corner radius (default 32)}, groupIds, frameId, points, startArrowhead/endArrowhead (arrows default to end "arrow"; "none" = no head), startBindingId/endBindingId, text (also a frame's title), fontSize, fontFamily (1 hand, 12 SF Pro, 13 SF Mono), textAlign, verticalAlign, containerId (label in a shape), link (image path); frame: strokeColor, backgroundColor/gradient, fontSize (title) restyle it; shadow (true or {dx,dy,blur,color}, pt), blur (pt), clipTo (id of a closed shape masking this one). Text wraps to a width narrower than it; a shape grows to fit its label (size it with measure_text). Invalid fields → warnings. Your ids are remapped, refs preserved, and stay usable afterward. {type:"path", d:"M... C... Z"} takes SVG path data (width/height scale it); a line whose last point equals its first fills as a polygon (roundness {type:2} smooths). Author from 0,0: the scene is scaled to fit the view (fit:false opts out) and moved to x/y, the view center or the nearest free spot; anchor "absolute" keeps it as given. Illustration recipe: a frame as canvas; back-to-front sky/ground paths with gradient fills, then objects built from paths/ellipses, shared groupIds per object; shadow/blur for depth and glow, clipTo to keep details inside a shape; then render_board. Palette fills #a5d8ff #b2f2bb #ffec99 #ffc9c9 #d0bfff #ffd8a8, strokes #1971c2 #2f9e44 #f08c00 #e03131 #7048e8 #e8590c. */
    mcp__whitespace__import_elements: {
      /** center (default): move the scene's box to x/y or the view center; absolute: keep coordinates as given */
      anchor?: "center" | "absolute"
      /** Array of element objects (a JSON string of the array also works), e.g. [{"type":"rectangle","id":"a","x":0,"y":0,"width":200,"height":80,"backgroundColor":"#a5d8ff"},{"type":"arrow","startBindingId":"a","endBindingId":"b","points":[[0,0],[0,120]]}] */
      elements: {}[]
      /** Optional center y */
      y?: number
      /** Optional center x for the whole scene (defaults to view center) */
      x?: number
    }
    /** Drop a stencil from the library onto the board by id (see list_stencils). Optionally position its center at (x, y). */
    mcp__whitespace__insert_stencil: {
      /** Optional center x */
      x?: number
      /** Stencil id from list_stencils */
      id: string
      /** Optional center y */
      y?: number
      /** Optional short handle to reference this stencil from arrows in the same response */
      ref?: string
    }
    /** List the reusable stencils available to insert: bundled architecture components (servers, databases, queues, clouds...), clean line icons (icon-database, icon-queue, icon-cache, icon-cloud, icon-user, icon-server, icon-load-balancer, icon-browser, icon-mobile, icon-bucket, icon-function, icon-gateway) and the user's saved stencils. */
    mcp__whitespace__list_stencils: {}
    /** Measure the rendered size of a text string at a font size BEFORE placing it — size boxes to fit their labels instead of guessing. */
    mcp__whitespace__measure_text: {
      /** The text to measure (may contain newlines) */
      text: string
      /** Font: 1 Hand-drawn, 9 Chalkboard, 7 Noteworthy, 6 Marker Felt, 2 Helvetica, 10 Avenir Next, 11 Georgia, 5 Futura, 8 Snell Roundhand, 3 Menlo (code), 12 SF Pro, 13 SF Mono (default 1) */
      fontFamily?: number
      /** Optional wrap width — text wraps to this and grows downward */
      maxWidth?: number
      /** Font size in points (default 20) */
      fontSize?: number
    }
    /** Manage the reusable color palette: list built-in + custom colors and gradients, add a custom color or gradient (they also appear as swatches in the app's inspector), or remove one. */
    mcp__whitespace__palette: {
      /** What to do */
      action: "list" | "add_color" | "add_gradient" | "remove"
      /** Hex color for add_color/remove (e.g. #40c057), or gradient 'fromHex>toHex@angleDegrees' for add_gradient (e.g. '#a5d8ff>#d0bfff@90') */
      value?: string
    }
    /** Render the current board (or exactly the given region) to PNG; the image is returned inline (the file path is included too). Use this to visually verify layout after drawing, then fix overlaps/misalignment with update_elements. */
    mcp__whitespace__render_board: {
      /** Optional region top-left y */
      y?: number
      /** Optional region height */
      height?: number
      /** Pixels per point, 0.5–4 (default 2); raise it to inspect small detail in a region */
      scale?: number
      /** Optional region top-left x */
      x?: number
      /** Optional region width */
      width?: number
    }
    /** Select elements and bring them into the user's view (zooms to fit). Use after creating something so the user sees it. mode "move" instead moves the elements (or group ids from get_board) themselves into the visible area — scaled down to fit, at a free spot — without moving the camera. */
    mcp__whitespace__show_user: {
      /** Element or group ids */
      ids: string[]
      /** camera (default): move the view; move: move the elements into view */
      mode?: "camera" | "move"
    }
    /** Edit existing elements: move, resize, relabel, restyle, rotate, lock, reorder. Only the provided fields change; any element field from import_elements is accepted (null or "none" clears optional ones). Bad values are skipped with a warning line. */
    mcp__whitespace__update_elements: {
      /** One entry per element to change */
      updates: Array<{
        /** New x */
        x?: number
        /** New y */
        y?: number
        /** New text/label */
        text?: string
        /** New outline width */
        strokeWidth?: number
        /** Id of a closed shape masking this one, or 'none' */
        clipTo?: string
        /** New fill hex or 'transparent' */
        backgroundColor?: string
        /** true, {dx,dy,blur,color} (pt), or null to remove */
        shadow?: unknown
        locked?: boolean
        /** Element id */
        id: string
        /** Gradient direction in degrees */
        gradientAngle?: number
        /** {type:linear|radial, angle, cx, cy, r, stops:[...]} as in import_elements, or 'none' */
        gradient?: unknown
        /** Rotation in RADIANS */
        angle?: number
        /** Restack */
        zOrder?: "front" | "back" | "forward" | "backward"
        /** New stroke hex */
        strokeColor?: string
        /** Fill pattern */
        fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag"
        /** 0–100 */
        opacity?: number
        /** New width */
        width?: number
        /** New font size (text elements) */
        fontSize?: number
        /** 0 = one crisp stroke; 1 = doubled sketch stroke */
        roughness?: number
        /** {type:3} rounds corners, null squares them */
        roundness?: unknown
        /** Gaussian blur, pt */
        blur?: number
        /** Line/arrow points [[x,y],...] relative to x,y */
        points?: number[][]
        /** New height */
        height?: number
        /** Second gradient hex, or 'none' to clear the gradient */
        backgroundGradient?: string
        /** Arrow start head */
        startArrowhead?: "none" | "arrow" | "bar" | "dot" | "circle" | "circle_outline" | "triangle" | "triangle_outline" | "diamond" | "diamond_outline" | "cross" | "crowfoot_one" | "crowfoot_many" | "crowfoot_one_or_many" | "crowfoot_zero_or_one" | "crowfoot_zero_or_many"
        /** Arrow end head */
        endArrowhead?: "none" | "arrow" | "bar" | "dot" | "circle" | "circle_outline" | "triangle" | "triangle_outline" | "diamond" | "diamond_outline" | "cross" | "crowfoot_one" | "crowfoot_many" | "crowfoot_one_or_many" | "crowfoot_zero_or_one" | "crowfoot_zero_or_many"
        /** Font: 1 Hand-drawn, 9 Chalkboard, 7 Noteworthy, 6 Marker Felt, 2 Helvetica, 10 Avenir Next, 11 Georgia, 5 Futura, 8 Snell Roundhand, 3 Menlo (code), 12 SF Pro, 13 SF Mono */
        fontFamily?: number
        /** Text alignment */
        textAlign?: "left" | "center" | "right"
        /** New outline style */
        strokeStyle?: "solid" | "dashed" | "dotted"
      }>
    }
  }
}
