import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Side-effect imports: registers `<neon-icon>` and wires the Vite
// `import.meta.glob`-backed loader.
import '../src/icon.js';
import '../src/icon-vite-loader.js';

/** Wait for the element's async load + paint to settle. */
async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

describe('icon-vite-loader', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('resolves an outline icon by name via the glob loader', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement | null} */ (document.querySelector('neon-icon > svg'));
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg?.getAttribute('stroke')).toBe('currentColor');
    });

    it('resolves a mini icon with a different viewBox', async () => {
        document.body.innerHTML = `<neon-icon name="mini/bars-3"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement | null} */ (document.querySelector('neon-icon > svg'));
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 20 20');
        expect(svg?.getAttribute('fill')).toBe('currentColor');
    });
});
