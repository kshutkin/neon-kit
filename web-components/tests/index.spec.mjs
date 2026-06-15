import { describe, expect, it } from 'vitest';

import '../src/index.js';

describe('@neon-kit/web-components', () => {
    it('registers every component on import', () => {
        expect(customElements.get('neon-tooltip')).toBeTruthy();
        expect(customElements.get('neon-menu')).toBeTruthy();
        expect(customElements.get('neon-menu-item')).toBeTruthy();
        expect(customElements.get('neon-combobox')).toBeTruthy();
        expect(customElements.get('neon-multicombobox')).toBeTruthy();
        expect(customElements.get('neon-datepicker')).toBeTruthy();
        expect(customElements.get('neon-timepicker')).toBeTruthy();
        expect(customElements.get('neon-icon')).toBeTruthy();
    });
});
