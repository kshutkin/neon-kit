declare module '@neon-kit/web-components' {
	/**
	 * Define `<neon-tooltip>` as an autonomous custom element. Idempotent.
	 *
	 * @param tagName Optional override for the tag name.
	 *   Defaults to `neon-tooltip`.
	 */
	export function registerTooltip(tagName?: string): void;

	export class NeonTooltipElement extends HTMLElement {
		static get observedAttributes(): string[];
		connectedCallback(): void;
		disconnectedCallback(): void;
		attributeChangedCallback(): void;
		/** Programmatically show the tooltip. */
		showTooltip(): void;
		/** Programmatically hide the tooltip. */
		hideTooltip(): void;
		#private;
	}
	/**
	 * Define `<neon-menu>` if it has not been registered yet. Idempotent.
	 *
	 * @param tagName Optional override tag name. Defaults to `neon-menu`.
	 */
	export function registerMenu(tagName?: string): void;
	export class NeonMenuElement extends HTMLElement {
		connectedCallback(): void;
		disconnectedCallback(): void;
		/**
		 * The currently focused item, if any.
		 * */
		get activeItem(): HTMLElement | null;
		/**
		 * All items in DOM order, including disabled ones.
		 * */
		get items(): HTMLElement[];
		/**
		 * Focusable items (disabled excluded), in DOM order.
		 * */
		get focusableItems(): HTMLElement[];
		#private;
	}

	export {};
}

declare module '@neon-kit/web-components/tooltip' {
	/**
	 * Define `<neon-tooltip>` as an autonomous custom element. Idempotent.
	 *
	 * @param tagName Optional override for the tag name.
	 *   Defaults to `neon-tooltip`.
	 */
	export function registerTooltip(tagName?: string): void;

	export class NeonTooltipElement extends HTMLElement {
		static get observedAttributes(): string[];
		connectedCallback(): void;
		disconnectedCallback(): void;
		attributeChangedCallback(): void;
		/** Programmatically show the tooltip. */
		showTooltip(): void;
		/** Programmatically hide the tooltip. */
		hideTooltip(): void;
		#private;
	}
	export type Trigger = "hover" | "focus" | "click";

	export {};
}

declare module '@neon-kit/web-components/menu' {
	/**
	 * Define `<neon-menu>` if it has not been registered yet. Idempotent.
	 *
	 * @param tagName Optional override tag name. Defaults to `neon-menu`.
	 */
	export function registerMenu(tagName?: string): void;
	export class NeonMenuElement extends HTMLElement {
		connectedCallback(): void;
		disconnectedCallback(): void;
		/**
		 * The currently focused item, if any.
		 * */
		get activeItem(): HTMLElement | null;
		/**
		 * All items in DOM order, including disabled ones.
		 * */
		get items(): HTMLElement[];
		/**
		 * Focusable items (disabled excluded), in DOM order.
		 * */
		get focusableItems(): HTMLElement[];
		#private;
	}

	export {};
}

//# sourceMappingURL=index.d.ts.map