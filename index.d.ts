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
export const OPEN: number;
/**
 * Include **closed** programmatic shadow roots when forwarding `observe` onto new roots.
 * @readonly
 */
export const CLOSED: number;
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
    override observe(target: Node, options: ShadowOptions): void;
}
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
export type ShadowOptions = MutationObserverInit & {
    shadow?: true | number | number | (number | number);
};
export type ShadowDetailsEntry = [WeakRef<Node>, ShadowOptions & {
    shadow: number | number | (number | number);
}];
export type ShadowDetails = ShadowDetailsEntry[];
