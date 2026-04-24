// @ts-check

/**
 * Extends {@link MutationObserver} so that observing a node with `subtree: true` and a
 * `shadow` bitmask also observes matching **author** shadow roots created later via
 * {@link Element.attachShadow} on descendants (same JS realm, after this module loads).
 *
 * **In scope:** programmatic `attachShadow` under the observed subtree; `ShadowRootInit.mode`
 * omitted is treated as `"open"` per the DOM spec.
 *
 * **Out of scope:** declarative shadow DOM (no `attachShadow` hook), non-author shadow
 * trees that never return a `ShadowRoot` through this `attachShadow` patch, other realms
 * (e.g. iframes), and roots attached before `observe()` runs.
 *
 * @module shadow-observer
 */

/**
 * Include **open** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 * @type {1}
 */
export const OPEN = /** @type {1} */ (1 << 0);

/**
 * Include **closed** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 * @type {2}
 */
export const CLOSED = /** @type {2} */ (1 << 1);

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
 *   shadow?: true | typeof OPEN | typeof CLOSED | (typeof OPEN | typeof CLOSED)
 * }} ShadowObserverInit
 */

/**
 * @typedef {typeof OPEN | typeof CLOSED | (typeof OPEN | typeof CLOSED)} ShadowObserverMask
 */

/**
 * @typedef {[WeakRef<Node>, ShadowObserverInit & { shadow: ShadowObserverMask }]} ShadowDetailsEntry
 */

/**
 * @typedef {ShadowDetailsEntry[]} ShadowDetails
 */

/**
 * Instance created by `new ShadowObserver(...)`.
 *
 * @typedef {MutationObserver & {
 *   observe(target: Node, options: ShadowObserverInit): void;
 * }} ShadowObserver
 */

/**
 * The {@link ShadowObserver} export: a {@link MutationObserver} subclass constructor.
 *
 * @typedef {new (callback: MutationCallback) => ShadowObserver} ShadowObserverConstructor
 */

const so = Symbol.for('shadow-observer');

if (!globalThis[so]) {

  /** @type {ReadonlySet<number>} */
  const masks = new Set([OPEN, CLOSED, OPEN | CLOSED]);

  /** @type {Map<WeakRef<MutationObserver>, ShadowDetails>} */
  const observers = new Map;

  /** @type {WeakMap<Node, [ShadowRoot, ShadowRootInit['mode']]>} */
  const shadowRoots = new WeakMap;

  /** @type {WeakMap<MutationObserver, WeakRef<MutationObserver>>} */
  const weakObserver = new WeakMap;

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

  /**
   * @param {Node} parentNode
   * @param {ShadowRoot} shadowRoot
   * @param {ShadowRootInit['mode']} mode
   */
  const propagate = (parentNode, shadowRoot, mode) => {
    for (const [wr, details] of [...observers]) {
      const observer = wr.deref();
      if (observer) {
        for (let i = 0; i < details.length; i++) {
          const [wr, opts] = details[i];
          const target = wr.deref();
          if (target) {
            if (mode === 'open' && (opts.shadow & OPEN) && inIt(parentNode, target))
              observe.call(observer, shadowRoot, opts);
            else if (mode === 'closed' && (opts.shadow & CLOSED) && inIt(parentNode, target))
              observe.call(observer, shadowRoot, opts);
          }
          else details.splice(i--, 1);
        }
      }
      else observers.delete(wr);
    }
  };

  const { attachShadow } = Element.prototype;
  const { observe } = MutationObserver.prototype;
  const { defineProperty, freeze } = Object;
  const { from } = Array;

  defineProperty(Element.prototype, 'attachShadow', {
    /**
     * @this {Element}
     * @param {ShadowRootInit} options
     * @returns {ShadowRoot}
     */
    value: function (options) {
      const shadowRoot = attachShadow.call(this, options);
      const { mode } = options;
      if (this.isConnected)
        propagate(this, shadowRoot, mode);
      else
        shadowRoots.set(this, [shadowRoot, mode]);
      return shadowRoot;
    },
  });

  class ShadowRootList extends Array {
    /**
     * @param {ShadowRoot} shadowRoot
     */
    constructor(shadowRoot) {
      freeze(super(shadowRoot));
    }

    item(index) {
      return this[index];
    }
  }

  /**
   * @internal
   */
  class AugmentedRecord {

    /** @type {Node} */
    #target;

    /** @type {ShadowRootList} */
    #addedNodes;

    /**
     * @param {Node} target
     * @param {ShadowRootList} addedNodes
     */
    constructor(target, addedNodes) {
      this.#target = target;
      this.#addedNodes = addedNodes;
    }

    get type() { return 'childList' }
    get target() { return this.#target }
    get addedNodes() { return this.#addedNodes }
    get removedNodes() { return [] }
  }

  /**
   * @param {*} extras
   * @param {*} node
   * @returns
   */
  const upgraade = (extras, node) => {
    const args = shadowRoots.get(node);
    if (args) {
      const [shadowRoot, mode] = args;
      shadowRoots.delete(node);
      propagate(node, shadowRoot, mode);
      if (mode === 'closed')
        extras.push(new AugmentedRecord(node, new ShadowRootList(shadowRoot)));
      // @ts-ignore
      for (const node of shadowRoot.querySelectorAll('*'))
        upgraade(extras, node);
    }
  };

  /**
   * {@link MutationObserver} that optionally follows {@link Element.attachShadow} under an
   * observed subtree when `observe` is called with `subtree` and a supported `shadow` mask.
   *
   * @extends {MutationObserver}
   * @internal
   */
  class ShadowObserverImpl extends MutationObserver {
    /**
     * @param {MutationCallback} callback
     */
    constructor(callback) {
      super(function (records, ...rest) {
        const extras = [];
        for (let i = 0, length = records.length; i < length; i++) {
          const record = records[i];
          if (record.type === 'childList') {
            const { addedNodes } = record;
            for (let j = 0, length = addedNodes.length; j < length; j++)
              upgraade(extras, addedNodes[j]);
          }
        }
        if (extras.length) {
          // @ts-ignore
          records = from(records).concat(extras);
        }
        callback.call(this, records, ...rest);
      });
    }

    /**
     * Like {@link MutationObserver.observe}, but when `options.subtree` is true and
     * `options` includes a `shadow` property with a supported mask, also registers to call
     * `observe` on new shadow roots that match the mask and whose host lies under `target`.
     *
     * @override
     * @param {Node} target
     * @param {ShadowObserverInit} options
     * @returns {void}
     */
    observe(target, options) {
      if (options?.subtree && options && 'shadow' in options) {
        const shadow = options.shadow === true ? OPEN : (options.shadow ?? 0);
        if (masks.has(shadow)) {
          const mask = /** @type {ShadowObserverMask} */ (shadow);
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

  defineProperty(globalThis, so, { value: ShadowObserverImpl });
}

/**
 * Singleton constructor (per realm) so duplicate bundles share one implementation and
 * `attachShadow` is patched at most once.
 *
 * @type {ShadowObserverConstructor}
 */
export const ShadowObserver = /** @type {ShadowObserverConstructor} */ (globalThis[so]);
