/**
 * Aggregate entry — registers all `<neon-*>` custom elements as a side
 * effect of importing this module.
 *
 * Each component self-registers on import via `defineElement(...)`.
 * To opt into a single component, import its subpath module instead
 * (e.g. `@neon-kit/web-components/tooltip`).
 */

import './tooltip.jsx';
import './menu.js';
import './combobox.jsx';
import './multicombobox.jsx';
import './datepicker.jsx';
import './timepicker.jsx';
import './icon.jsx';
