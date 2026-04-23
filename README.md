# shadow-observer

<sub><strong>Cover image: AI-generated art (Cursor), 2026. This file is documentation-only and is not covered by the MIT license on the package source code; see <a href="LICENSE">LICENSE</a> for software terms.</strong></sub>

- - -

**TL;DR** - I got tired [in here](https://github.com/whatwg/dom/issues/1287), I needed to move forward, enjoy 👋

`MutationObserver` does not cross into shadow trees. This package provides **`ShadowObserver`**, a small subclass that patches `Element.prototype.attachShadow` so that when you observe a node with `subtree: true` and a **`shadow`** mask, matching **author** shadow roots created later under that subtree are observed with the same options.

**Use `ShadowObserver` instead of the global `MutationObserver` everywhere:** shadow forwarding is **strictly opt-in**. Unless `observe` is called with **`subtree: true` and a `shadow` property** set to a supported mask (`true`, `OPEN`, `CLOSED`, or `OPEN | CLOSED`), the class does **not** register any shadow hook for that observation—it just delegates to `MutationObserver.prototype.observe`, so callbacks and options behave like the native observer.

Loading the module still installs one global `attachShadow` wrapper (so the feature can work when you do opt in); with no matching registrations, that wrapper is effectively a no-op aside from a small loop over empty state.

Use it when you control load order and care about **programmatic** `attachShadow` in the **same** JavaScript realm (for example observing `document` or a known app root).

## Usage

Load the module **before** application code that might call `attachShadow` (or keep a reference to the native function), so the patch is in place.

```javascript
import { ShadowObserver, OPEN, CLOSED } from 'shadow-observer';

const observer = new ShadowObserver((records) => {
  // …same as MutationObserver
});

observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  shadow: OPEN | CLOSED, // follow open and closed author roots
});
```

### `shadow` option

Registration only runs when **`subtree` is true** and the options object **includes the `shadow` key** (even if the value is later ignored).

- **`true`** — same as `OPEN` only.
- **`OPEN`** — forward only when `attachShadow` creates an **open** root (including omitted `mode`, which defaults to `"open"` per the DOM spec).
- **`CLOSED`** — forward only for **closed** roots.
- **`OPEN | CLOSED`** — forward for both open and closed programmatic roots (bitmask of the two exports).

Other values are ignored for shadow forwarding (the normal `observe` call still runs).

### Exports

- **`ShadowObserver`** — extends `MutationObserver`; use `observe` as above.
- **`OPEN`**, **`CLOSED`** — bit flags for the `shadow` option.

## In scope

- Programmatic `Element.attachShadow` on hosts that are **descendants** (in the composed ancestor sense) of the node you passed to `observe`.
- Omitted `ShadowRootInit.mode` treated as `"open"`.

## Out of scope

- **Declarative Shadow DOM** and any shadow tree that is not created through the patched `attachShadow` (no hook runs, so no automatic `observe` on that root).
- **Closed** roots you can never reference from script (same platform limitation as always).
- **Other realms** (e.g. iframes): each frame has its own `Element.prototype`; this patch applies only where the module runs.
- Shadow roots **already attached** before you call `observe` (no retroactive attach event).

## License

MIT
