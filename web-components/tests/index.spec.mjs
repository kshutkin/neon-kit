import { describe, expect, it } from 'vitest';

import * as wc from '../src/index.js';

describe('@neon-kit/web-components', () => {
    it('exposes register helpers', () => {
        expect(typeof wc.registerTooltip).toBe('function');
        expect(typeof wc.registerMenu).toBe('function');
        expect(typeof wc.registerCombobox).toBe('function');
        expect(typeof wc.registerMulticombobox).toBe('function');
        expect(typeof wc.NeonMenuElement).toBe('function');
        expect(typeof wc.NeonTooltipElement).toBe('function');
        expect(typeof wc.NeonComboboxElement).toBe('function');
        expect(typeof wc.NeonMulticomboboxElement).toBe('function');
    });
});
