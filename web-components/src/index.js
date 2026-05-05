/**
 * Aggregate entry — re-exports the public API of every component.
 *
 * Importing this module does NOT register any custom elements. Import the
 * subpath module (e.g. `@neon-kit/web-components/tooltip`) to side-effect
 * register, or call the named `register*` exports here explicitly.
 */

export { NeonTooltipElement, registerTooltip } from './tooltip.js';
export { NeonMenuElement, registerMenu } from './menu.js';
