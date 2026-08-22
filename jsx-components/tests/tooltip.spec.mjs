import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { createElement, Fragment, render } from '@slimlib/jsx';
import { signal } from '@slimlib/store';

import { Tooltip } from '../src/tooltip.jsx';

/** @type {Array<() => void>} */
let renderDisposers = [];

/**
 * @param {import('axe-core').AxeResults} results
 */
function formatAxeViolations(results) {
    return results.violations
        .map((violation) => {
            const targets = violation.nodes.map((node) => node.target.join(', ')).join('; ');
            return `${violation.id}: ${violation.help} (${targets})`;
        })
        .join('\n');
}

function createHost() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

/**
 * @param {import('@slimlib/jsx').Child} content
 * @param {{ placement?: string | (() => string | undefined), trigger?: string | (() => string | undefined), triggerElement?: HTMLElement }} [options]
 */
function mountTooltip(content, options = {}) {
    const host = createHost();
    const triggerElement = options.triggerElement ?? document.createElement('button');
    triggerElement.type = 'button';
    triggerElement.textContent = triggerElement.textContent || 'Save';

    const dispose = render(() => Tooltip({
        content,
        placement: options.placement,
        trigger: options.trigger,
        children: triggerElement,
    }), host);
    renderDisposers.push(dispose);

    const tooltipElement = /** @type {HTMLElement} */ (triggerElement.querySelector('.tooltip'));
    return { dispose, host, tooltipElement, triggerElement };
}

const tick = () => Promise.resolve();

describe('Tooltip JSX component', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        for (const dispose of renderDisposers) {
            dispose();
        }
        renderDisposers = [];
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('decorates one trigger element with a tooltip popover', () => {
        const { host, tooltipElement, triggerElement } = mountTooltip('Persists the draft.');

        expect(host.firstElementChild).toBe(triggerElement);
        expect(tooltipElement).not.toBeNull();
        expect(tooltipElement.parentElement).toBe(triggerElement);
        expect(tooltipElement.hasAttribute('popover')).toBe(true);
        expect(tooltipElement.getAttribute('role')).toBe('tooltip');
        expect(tooltipElement.classList.contains('tooltip')).toBe(true);
        expect(tooltipElement.classList.contains('-top')).toBe(true);
        expect(tooltipElement.id).toMatch(/^neon-tooltip-[a-z0-9]{9}$/);
        expect(triggerElement.getAttribute('aria-describedby')).toBe(tooltipElement.id);
        expect(tooltipElement.querySelector('.tooltip__arrow')).not.toBeNull();
    });

    it('accepts the JSX single-child array shape for the trigger', () => {
        const host = createHost();
        const triggerElement = document.createElement('button');
        triggerElement.type = 'button';
        triggerElement.textContent = 'Save';
        const dispose = render(() => Tooltip({
            content: 'Persists the draft.',
            children: [triggerElement],
        }), host);
        renderDisposers.push(dispose);

        const tooltipElement = /** @type {HTMLElement} */ (triggerElement.querySelector('.tooltip'));
        expect(host.firstElementChild).toBe(triggerElement);
        expect(tooltipElement).not.toBeNull();
        expect(triggerElement.getAttribute('aria-describedby')).toBe(tooltipElement.id);
    });

    it('renders rich non-interactive JSX content', () => {
        const content = createElement(Fragment, null,
            createElement('div', { class: 'tooltip__title' }, 'Shortcut'),
            createElement('p', { class: 'tooltip__body' }, 'Open command search.'),
            createElement('div', { class: 'tooltip__meta' },
                createElement('kbd', { class: 'kbd' }, 'Ctrl'),
                ' + ',
                createElement('kbd', { class: 'kbd' }, 'K'),
            ),
        );
        const { tooltipElement } = mountTooltip(content);

        expect(tooltipElement.querySelector('.tooltip__title')?.textContent).toBe('Shortcut');
        expect(tooltipElement.querySelector('.tooltip__body')?.textContent).toBe('Open command search.');
        expect(tooltipElement.querySelectorAll('button, a[href], input, select, textarea')).toHaveLength(0);
    });

    it('respects every placement and falls back to top for unknown values', () => {
        for (const placement of ['top', 'right', 'bottom', 'left']) {
            document.body.innerHTML = '';
            const { tooltipElement } = mountTooltip('Hint.', { placement });
            expect(tooltipElement.classList.contains(`-${placement}`)).toBe(true);
        }

        document.body.innerHTML = '';
        const { tooltipElement } = mountTooltip('Hint.', { placement: 'somewhere' });
        expect(tooltipElement.classList.contains('-top')).toBe(true);
    });

    it('updates placement and trigger when reactive props change', async () => {
        vi.useFakeTimers();
        const placement = signal('top');
        const trigger = signal('click');
        const { tooltipElement, triggerElement } = mountTooltip('Hint.', {
            placement,
            trigger,
        });

        expect(tooltipElement.classList.contains('-top')).toBe(true);
        placement.set('bottom');
        await tick();
        expect(tooltipElement.classList.contains('-bottom')).toBe(true);

        triggerElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tooltipElement.matches(':popover-open')).toBe(true);
        tooltipElement.hidePopover();

        trigger.set('hover');
        await tick();
        triggerElement.dispatchEvent(new Event('pointerenter'));
        vi.advanceTimersByTime(400);
        expect(tooltipElement.matches(':popover-open')).toBe(true);
    });

    it('opens and closes on hover delays', () => {
        vi.useFakeTimers();
        const { tooltipElement, triggerElement } = mountTooltip('Hint.');

        triggerElement.dispatchEvent(new Event('pointerenter'));
        expect(tooltipElement.matches(':popover-open')).toBe(false);
        vi.advanceTimersByTime(399);
        expect(tooltipElement.matches(':popover-open')).toBe(false);
        vi.advanceTimersByTime(1);
        expect(tooltipElement.matches(':popover-open')).toBe(true);

        triggerElement.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(499);
        expect(tooltipElement.matches(':popover-open')).toBe(true);
        vi.advanceTimersByTime(1);
        expect(tooltipElement.matches(':popover-open')).toBe(false);
    });

    it('toggles on click and closes on Escape', () => {
        const span = document.createElement('span');
        span.tabIndex = 0;
        span.textContent = 'Status';
        const { tooltipElement, triggerElement } = mountTooltip('Hint.', {
            trigger: 'click',
            triggerElement: span,
        });

        triggerElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tooltipElement.matches(':popover-open')).toBe(true);

        triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tooltipElement.matches(':popover-open')).toBe(false);
    });

    it('extends consumer-owned aria wiring and keeps consumer-owned attributes on disposal', () => {
        const triggerElement = document.createElement('button');
        triggerElement.type = 'button';
        triggerElement.textContent = 'Save';
        triggerElement.setAttribute('aria-describedby', 'external-first external-second');
        triggerElement.style.setProperty('anchor-name', '--existing');
        const { dispose, tooltipElement } = mountTooltip('Hint.', { triggerElement });

        expect(triggerElement.getAttribute('aria-describedby'))
            .toBe(`external-first external-second ${tooltipElement.id}`);
        expect(tooltipElement.style.getPropertyValue('position-anchor')).toBe('--existing');

        dispose();
        expect(triggerElement.getAttribute('aria-describedby')).toBe('external-first external-second');
        expect(triggerElement.style.getPropertyValue('anchor-name')).toBe('--existing');
    });

    it('cleans up owned trigger attributes when the render is disposed', () => {
        const { dispose, host, tooltipElement, triggerElement } = mountTooltip('Hint.');
        const anchorName = triggerElement.style.getPropertyValue('anchor-name');

        expect(triggerElement.getAttribute('aria-describedby')).toBe(tooltipElement.id);
        expect(anchorName).toMatch(/^--neon-tooltip-anchor-/);

        dispose();
        expect(host.firstChild).toBeNull();
        expect(triggerElement.hasAttribute('aria-describedby')).toBe(false);
        expect(triggerElement.style.getPropertyValue('anchor-name')).toBe('');
    });

    it('keeps owned trigger attributes that are changed before disposal', () => {
        const { dispose, tooltipElement, triggerElement } = mountTooltip('Hint.');

        expect(triggerElement.getAttribute('aria-describedby')).toBe(tooltipElement.id);
        expect(triggerElement.style.getPropertyValue('anchor-name')).toMatch(/^--neon-tooltip-anchor-/);

        triggerElement.setAttribute('aria-describedby', 'external');
        triggerElement.style.setProperty('anchor-name', '--external');

        dispose();
        expect(triggerElement.getAttribute('aria-describedby')).toBe('external');
        expect(triggerElement.style.getPropertyValue('anchor-name')).toBe('--external');
    });

    it('cleans up a tooltip that is removed through a reactive child boundary', async () => {
        const host = createHost();
        const visible = signal(true);
        const triggerElement = document.createElement('button');
        triggerElement.type = 'button';
        triggerElement.textContent = 'Save';
        const dispose = render(() => () => visible()
            ? Tooltip({ content: 'Hint.', children: triggerElement })
            : null, host);
        renderDisposers.push(dispose);

        await tick();
        expect(triggerElement.getAttribute('aria-describedby')).toMatch(/^neon-tooltip-/);

        visible.set(false);
        await tick();
        expect(host.firstChild).toBeInstanceOf(Comment);
        expect(triggerElement.hasAttribute('aria-describedby')).toBe(false);
    });

    it('warns for an invalid child and non-focusable focus trigger', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

        const host = createHost();
        renderDisposers.push(render(() => Tooltip({ content: 'Hint.', children: 'Save' }), host));
        expect(debug).toHaveBeenCalledWith(
            'Tooltip: expected exactly one HTMLElement child to use as the trigger.',
            'Save',
        );

        const span = document.createElement('span');
        span.textContent = 'Status';
        renderDisposers.push(render(() => Tooltip({ content: 'Hint.', children: span }), createHost()));
        expect(debug).toHaveBeenCalledWith(
            'Tooltip: parent element is not focusable; the `focus` trigger will not fire.',
            span,
        );
    });

    it('has no axe violations for a simple informational tooltip', async () => {
        mountTooltip('Persists the current draft.');

        const results = await axe.run(document.body);
        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });

    it('has no axe violations for a rich informational tooltip', async () => {
        mountTooltip(createElement(Fragment, null,
            createElement('div', { class: 'tooltip__title' }, 'Shortcut'),
            createElement('p', { class: 'tooltip__body' }, 'Open command search.'),
            createElement('kbd', { class: 'kbd' }, 'Ctrl + K'),
        ));

        const results = await axe.run(document.body);
        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });
});
