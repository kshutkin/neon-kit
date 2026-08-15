import { render } from '@slimlib/jsx';
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
                    <div class="menu__group">
                        <MenuItem>
                            <span class="menu__label">New file</span>
                            <span class="menu__shortcut kbd-keys">
                                <kbd class="kbd">⌘</kbd>
                                <kbd class="kbd">N</kbd>
                            </span>
                        </MenuItem>
                        <MenuItem>
                            <span class="menu__label">Open</span>
                        </MenuItem>
                        <MenuItem disabled>
                            <span class="menu__label">Delete</span>
                        </MenuItem>
                    </div>
                }
            >
                <button type="button" class="btn">Actions</button>
            </Menu>
        ), basicDemo));
    }

    const nestedDemo = document.querySelector('[data-jsx-menu-demo="nested"]');
    if (nestedDemo) {
        disposers.push(render(() => (
            <Menu
                content={
                    <div class="menu__group">
                        <MenuItem>
                            <span class="menu__label">Rename</span>
                        </MenuItem>
                        <Menu
                            placement="inline-end"
                            content={
                                <div class="menu__group">
                                    <MenuItem>
                                        <span class="menu__label">PDF document</span>
                                    </MenuItem>
                                    <MenuItem>
                                        <span class="menu__label">Markdown file</span>
                                    </MenuItem>
                                </div>
                            }
                        >
                            <MenuItem>
                                <span class="menu__label">Export as</span>
                                <span aria-hidden="true" class="menu__chevron">›</span>
                            </MenuItem>
                        </Menu>
                        <MenuItem>
                            <span class="menu__label">Archive</span>
                        </MenuItem>
                    </div>
                }
            >
                <button type="button" class="btn">Project actions</button>
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
