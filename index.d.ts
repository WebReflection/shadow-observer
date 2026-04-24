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
export const OPEN: 1;
/**
 * Include **closed** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 * @type {2}
 */
export const CLOSED: 2;
/**
 * Instance created by `new ShadowObserver(...)`.
 */
export type ShadowObserver = MutationObserver & {
    observe(target: Node, options: ShadowObserverInit): void;
};
/**
 * Singleton constructor (per realm) so duplicate bundles share one implementation and
 * `attachShadow` is patched at most once.
 *
 * @type {ShadowObserverConstructor}
 */
export const ShadowObserver: ShadowObserverConstructor;
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
 */
export type ShadowObserverInit = MutationObserverInit & {
    shadow?: true | typeof OPEN | typeof CLOSED | (typeof OPEN | typeof CLOSED);
};
export type ShadowObserverMask = typeof OPEN | typeof CLOSED | (typeof OPEN | typeof CLOSED);
export type ShadowDetailsEntry = [WeakRef<Node>, ShadowObserverInit & {
    shadow: ShadowObserverMask;
}];
export type ShadowDetails = ShadowDetailsEntry[];
/**
 * The {@link ShadowObserver} export: a {@link MutationObserver} subclass constructor.
 */
export type ShadowObserverConstructor = new (callback: MutationCallback) => ShadowObserver;
