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
  const fr = new FinalizationRegistry(wr => observers.delete(wr));

  /** @type {ReadonlySet<number>} */
  const masks = new Set([OPEN, CLOSED, OPEN | CLOSED]);

  /** @type {Map<WeakRef<MutationObserver>, ShadowDetails>} */
  const observers = new Map;

  /** @type {WeakMap<Node, [ShadowRoot, ShadowRootInit['mode']]>} */
  const shadowRoots = new WeakMap;

  /** @type {WeakMap<ShadowObserverImpl, WeakRef<ShadowObserverImpl>>} */
  const observersWR = new WeakMap;

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
    for (const [wr, details] of observers) {
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
    }
  };

  const { attachShadow } = Element.prototype;
  const { observe } = MutationObserver.prototype;
  const { defineProperty, freeze } = Object;

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

  /**
   * @internal
   */
  class ShadowRootList extends Array {
    /**
     * @param {ShadowRoot} shadowRoot
     */
    constructor(shadowRoot) {
      freeze(super(shadowRoot));
    }

    /**
     * @param {number} index
     * @returns {ShadowRoot}
     */
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

    /** @type {unknown[]} */
    #addedNodes;

    /** @type {unknown[]} */
    #removedNodes;

    /**
     * @param {Node} target
     * @param {unknown[]} addedNodes
     * @param {unknown[]} removedNodes
     */
    constructor(target, addedNodes, removedNodes) {
      this.#target = target;
      this.#addedNodes = addedNodes;
      this.#removedNodes = removedNodes;
    }

    get type() { return 'childList' }
    get target() { return this.#target }
    get addedNodes() { return this.#addedNodes }
    get removedNodes() { return this.#removedNodes }
  }

  /**
   * @param {function(unknown[], unknown): void} callback
   * @param {unknown[]} extras
   * @param {NodeList} nodes
   */
  const lopp = (callback, extras, nodes) => {
    for (let i = 0, length = nodes.length; i < length; i++)
      callback(extras, nodes[i]);
  };

  /**
   * @param {unknown[]} extras
   * @param {Node} node
   */
  const downgrade = (extras, node) => {
    const args = shadowRoots.get(node);
    if (args) {
      const shadowRoot = args[0];
      extras.push(new AugmentedRecord(node, [], new ShadowRootList(shadowRoot)));
      // @ts-ignore
      for (const node of shadowRoot.querySelectorAll('*'))
        downgrade(extras, node);
    }
  };

  /**
   * @param {unknown[]} extras
   * @param {Node} node
   */
  const upgraade = (extras, node) => {
    const args = shadowRoots.get(node);
    if (args) {
      const [shadowRoot, mode] = args;
      propagate(node, shadowRoot, mode);
      // this was for closed roots only but I think it'd be easier for whoever
      // needs to handle ShadowRoots to just receive all of them in one go
      // as opposite of checking it node.shadowRoot is null or something
      extras.push(new AugmentedRecord(node, new ShadowRootList(shadowRoot), []));
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
      const self = super(function (records, ...rest) {
        // @ts-ignore
        if (observersWR.has(self)) {
          const extras = [];
          for (let i = 0, length = records.length; i < length; i++) {
            const record = records[i];
            extras.push(record);
            if (record.type === 'childList') {
              lopp(downgrade, extras, record.removedNodes);
              lopp(upgraade, extras, record.addedNodes);
            }
          }
          records = extras;
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
          let wr = observersWR.get(this);
          if (!wr) observersWR.set(this, wr = new WeakRef(this));
          let details = observers.get(wr);
          if (!details) {
            observers.set(wr, details = []);
            fr.register(this, wr);
          }
          details.push([new WeakRef(target), { ...options, shadow: mask }]);
        }
      }
      observe.call(this, target, options);
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
