import { render } from '@slimlib/jsx';
import { Tooltip } from '@neon-kit/jsx-components/tooltip';

/** @type {Array<() => void>} */
let disposers = [];

function disposeDemos() {
    for (const dispose of disposers) {
        dispose();
    }
    disposers = [];
}

function mountDemos() {
    disposeDemos();

    const basicDemo = document.querySelector('[data-jsx-tooltip-demo="basic"]');
    if (basicDemo) {
        disposers.push(render(() => (
            <Tooltip content="Persists the current draft.">
                <button type="button" class="btn">Save</button>
            </Tooltip>
        ), basicDemo));
    }

    const placementDemo = document.querySelector('[data-jsx-tooltip-demo="placement"]');
    if (placementDemo) {
        disposers.push(render(() => (
            <>
                <Tooltip placement="top" content="Top placement">
                    <button type="button" class="btn">Top</button>
                </Tooltip>
                <Tooltip placement="right" content="Right placement">
                    <button type="button" class="btn">Right</button>
                </Tooltip>
                <Tooltip placement="bottom" content="Bottom placement">
                    <button type="button" class="btn">Bottom</button>
                </Tooltip>
                <Tooltip placement="left" content="Left placement">
                    <button type="button" class="btn">Left</button>
                </Tooltip>
            </>
        ), placementDemo));
    }

    const richDemo = document.querySelector('[data-jsx-tooltip-demo="rich"]');
    if (richDemo) {
        disposers.push(render(() => (
            <Tooltip
                placement="bottom"
                content={
                    <>
                        <div class="tooltip__title">Keyboard shortcut</div>
                        <div class="tooltip__body">Open command search.</div>
                        <div class="tooltip__meta">
                            <span class="kbd-keys">
                                <kbd class="kbd">⌘</kbd>
                                <kbd class="kbd">K</kbd>
                            </span>
                        </div>
                    </>
                }
            >
                <button type="button" class="btn">Command search</button>
            </Tooltip>
        ), richDemo));
    }
}

document.addEventListener('neon-docs:render', (event) => {
    const slug = /** @type {CustomEvent<{ slug: string }>} */ (event).detail.slug;
    if (slug === 'jsx-tooltip') {
        mountDemos();
    } else {
        disposeDemos();
    }
});
