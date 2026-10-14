import menuStyles from '@neon-kit/theme/components/menu.module.css';
import buttonStyles from '@neon-kit/theme/components/button.module.css';
import kbdStyles from '@neon-kit/theme/components/kbd.module.css';
import { render, svg } from '@slimlib/jsx';
import { Menu, MenuItem } from '@neon-kit/jsx-components/menu';

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

    const basicDemo = document.querySelector('[data-jsx-menu-demo="basic"]');
    if (basicDemo) {
        disposers.push(render(() => (
            <Menu
                content={
                    <div class={menuStyles['menu__group']}>
                        <MenuItem>
                            New file
                            <span class={`${menuStyles['menu__shortcut']} ${kbdStyles['kbd-keys']}`}>
                                <kbd class={kbdStyles['kbd']}>⌘</kbd>
                                <kbd class={kbdStyles['kbd']}>N</kbd>
                            </span>
                        </MenuItem>
                        <MenuItem>
                            Open
                        </MenuItem>
                        <MenuItem disabled>
                            Delete
                        </MenuItem>
                    </div>
                }
            >
                <button type="button" class={buttonStyles['btn']}>Actions</button>
            </Menu>
        ), basicDemo));
    }

    const nestedDemo = document.querySelector('[data-jsx-menu-demo="nested"]');
    if (nestedDemo) {
        disposers.push(render(() => (
            <Menu
                content={
                    <div class={menuStyles['menu__group']}>
                        <MenuItem>
                            Rename
                        </MenuItem>
                        <Menu
                            placement="inline-end"
                            content={
                                <div class={menuStyles['menu__group']}>
                                    <MenuItem>
                                        PDF document
                                    </MenuItem>
                                    <MenuItem>
                                        Markdown file
                                    </MenuItem>
                                </div>
                            }
                        >
                            <MenuItem>
                                Export as
                                {svg(() => (
                                    <svg
                                        class={menuStyles['menu__chevron']}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="2"
                                        stroke="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="m8.25 4.5 7.5 7.5-7.5 7.5"
                                        />
                                    </svg>
                                ))}
                            </MenuItem>
                        </Menu>
                        <MenuItem>
                            Archive
                        </MenuItem>
                    </div>
                }
            >
                <button type="button" class={buttonStyles['btn']}>Project actions</button>
            </Menu>
        ), nestedDemo));
    }
}

document.addEventListener('neon-docs:render', (event) => {
    const slug = /** @type {CustomEvent<{ slug: string }>} */ (event).detail.slug;
    if (slug === 'jsx-menu') {
        mountDemos();
    } else {
        disposeDemos();
    }
});
