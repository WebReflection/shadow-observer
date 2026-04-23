// @ts-check

/**
 * Extends {@link MutationObserver} so that observing a node with `subtree: true` and a
 * `shadow` bitmask also observes matching **author** shadow roots created later via
 * {@link Element.attachShadow} on descendants (same JS realm, after this module loads).
 *
 * **In scope:** programmatic `attachShadow` under the observed subtree; `ShadowRootInit.mode`
 * omitted is treated as `"open"` per the DOM spec.
 *
 * **Out of scope:** declarative shadow DOM (no `attachShadow` hook), closed roots you
 * cannot reference from script, other realms (e.g. iframes), and roots attached before
 * `observe()` runs.
 *
 * @module shadow-observer
 */

/**
 * Include **open** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 */
export const OPEN = 1 << 0;

/**
 * Include **closed** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 */
export const CLOSED = 1 << 1;

/** @type {ReadonlySet<number>} */
const shadow = new Set([OPEN, CLOSED, OPEN | CLOSED]);

/**
 * {@link MutationObserverInit} plus optional `shadow` controls for {@link ShadowObserver}.
 *
 * - `true` — same as {@link OPEN} only.
 * - {@link OPEN} — forward only when `attachShadow` resolves to an open root.
 * - {@link CLOSED} — forward only for closed roots.
 * - `OPEN | CLOSED` — forward for both modes.
 *
 * Registration runs only when `subtree` is true and the `shadow` key is present; other
 * values are ignored.
 *
 * @typedef {MutationObserverInit & {
 *   shadow?: true | OPEN | CLOSED | (OPEN | CLOSED)
 * }} ShadowOptions
 */

/**
 * @typedef {[WeakRef<Node>, ShadowOptions & { shadow: OPEN | CLOSED | (OPEN | CLOSED) }]} ShadowDetailsEntry
 */

/**
 * @typedef {ShadowDetailsEntry[]} ShadowDetails
 */

const { MutationObserver } = globalThis;

/** @type {Map<WeakRef<MutationObserver>, ShadowDetails>} */
const observers = new Map();

/** @type {WeakMap<MutationObserver, WeakRef<MutationObserver>>} */
const weakObserver = new WeakMap();

/**
 * Whether `node` is `root` or a descendant of `root` in the composed ancestor chain
 * (light DOM `parentNode`, else `ShadowRoot.host`).
 *
 * @param {Node} node
 * @param {Node} root
 * @returns {boolean}
 */
const inIt = (node, root) => {
  while (node) {
    if (node === root) return true;
    node = node.parentNode ?? /** @type {ShadowRoot} */ (node).host;
  }
  return false;
};

const { attachShadow } = Element.prototype;
Object.defineProperty(Element.prototype, 'attachShadow', {
  /**
   * @this {Element}
   * @param {ShadowRootInit} options
   * @returns {ShadowRoot}
   */
  value: function (options) {
    const result = attachShadow.call(this, options);
    const drop = [];
    for (const [wr, details] of observers) {
      const observer = wr.deref();
      if (observer) {
        for (let i = 0; i < details.length; i++) {
          const [targetWr, opts] = details[i];
          const target = targetWr.deref();
          if (target) {
            switch (options.mode ?? 'open') {
              case 'open':
                if ((opts.shadow & OPEN) && inIt(this, target))
                  observer.observe(result, opts);
                break;
              case 'closed':
                if ((opts.shadow & CLOSED) && inIt(this, target))
                  observer.observe(result, opts);
                break;
            }
          }
          else details.splice(i--, 1);
        }
      }
      else drop.push(wr);
    }

    for (let i = 0; i < drop.length; i++)
      observers.delete(drop[i]);

    return result;
  },
});

/**
 * {@link MutationObserver} that optionally follows {@link Element.attachShadow} under an
 * observed subtree when `observe` is called with `subtree` and a supported `shadow` mask.
 *
 * @extends {MutationObserver}
 */
export class ShadowObserver extends MutationObserver {
  /**
   * Like {@link MutationObserver.observe}, but when `options.subtree` is true and
   * `options` includes a `shadow` property with a supported mask, also registers to call
   * `observe` on new shadow roots that match the mask and whose host lies under `target`.
   *
   * @override
   * @param {Node} target
   * @param {ShadowOptions} options
   * @returns {void}
   */
  observe(target, options) {
    if (options?.subtree && options && 'shadow' in options) {
      const value = options.shadow === true ? OPEN : (options.shadow ?? 0);
      if (shadow.has(value)) {
        const mask =
          /** @type {OPEN | CLOSED | (OPEN | CLOSED)} */ (value);
        let wr = weakObserver.get(this);
        if (!wr) weakObserver.set(this, wr = new WeakRef(this));
        let details = observers.get(wr);
        if (!details) observers.set(wr, details = []);
        details.push([new WeakRef(target), { ...options, shadow: mask }]);
      }
    }
    super.observe(target, options);
  }
}
