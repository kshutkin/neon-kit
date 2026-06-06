# Menu Accessibility Checklist

Source: [WAI-ARIA APG Menu and Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)

Use this as a working checklist for the `neon-menu` component. Items are grouped by current fit: implemented, partial, not implemented, and not applicable or consumer-owned.

## Implemented

- [x] Menu container has a default `menu` role through ElementInternals.
- [x] Consumer-authored menu rows can use `role="menuitem"`.
- [x] The menu uses roving `tabindex` so one menu item is in the tab sequence at a time.
- [x] Opening a popover menu moves focus to the first focusable menu item.
- [x] `ArrowDown` moves focus to the next focusable menu item.
- [x] `ArrowUp` moves focus to the previous focusable menu item.
- [x] Arrow-key navigation wraps from the last focusable item to the first.
- [x] Arrow-key navigation wraps from the first focusable item to the last.
- [x] `Home` moves focus to the first focusable menu item.
- [x] `End` moves focus to the last focusable menu item.
- [x] `Enter` activates the focused item by dispatching its click behavior.
- [x] `Space` activates the focused item by dispatching its click behavior.
- [x] Disabled menu items do not activate on click.
- [x] Elements that are not menu items, such as group headers and separators without `.menu__item`, are skipped by keyboard navigation.
- [x] Focus restore fills the native popover gap when focus remains inside a closing menu and a valid trigger or invoker is available.

## Partially Implemented

- [ ] Disabled menu items should be focusable but not activatable according to APG; current behavior skips disabled items during keyboard navigation.
- [ ] Menu item activation should usually close the menu; current behavior leaves close-on-activation to the consumer.
- [ ] Submenus can be composed with nested popovers, but there is no dedicated submenu keyboard model.
- [ ] `Escape` relies on native popover behavior instead of explicit component-level close and invoker focus handling.
- [ ] Accessible names for menus are consumer-authored rather than managed by the component.

## Not Implemented

- [ ] `menubar` role.
- [ ] Horizontal menubar keyboard behavior.
- [ ] `Right Arrow` behavior for moving through menubar items.
- [ ] `Left Arrow` behavior for moving through menubar items.
- [ ] `Right Arrow` behavior for opening a submenu from a menu item.
- [ ] `Left Arrow` behavior for closing a submenu and returning focus to its parent menu item.
- [ ] Menubar submenu opening from arrow-key navigation.
- [ ] Printable-character typeahead.
- [ ] `menuitemcheckbox` role support.
- [ ] `menuitemradio` role support.
- [ ] Component-managed `aria-checked`.
- [ ] Component-managed `aria-haspopup` for submenu trigger items.
- [ ] Component-managed `aria-expanded` for submenu trigger items.
- [ ] Component-managed `aria-controls` or trigger-to-menu relationship wiring.
- [ ] Component-managed `aria-labelledby` wiring.
- [ ] Component-managed `aria-orientation`.
- [ ] `aria-activedescendant` focus strategy.
- [ ] `Tab` behavior that closes all open menus when focus leaves a menu or menubar.
- [ ] Close-all behavior for open ancestor or descendant menus.

## Not Applicable Or Consumer-Owned

- [ ] Desktop application menubar semantics are not a current `neon-menu` goal.
- [ ] Persistent menubar behavior is not a current `neon-menu` goal.
- [ ] `Shift + F10` context-menu invocation is outside the current component behavior.
- [ ] Ellipsis naming convention for items that open dialogs is content guidance for consumers.
- [ ] Separator roles and semantics are authored by consumers.
- [ ] Menu item roles beyond plain `menuitem` are authored by consumers until the component has first-class checkbox or radio menu items.
- [ ] Visual submenu indicators, such as a static chevron, are styling and markup authored by consumers.

## Open Refinement Questions

- [ ] Should disabled items become focusable to match APG, or should `neon-menu` intentionally keep native disabled controls out of arrow-key navigation?
- [ ] Should close-on-activation be built into the component, or remain a consumer pattern?
- [ ] Should nested menus graduate from "working composition" to a supported submenu model?
- [ ] If submenus become supported, should the component manage `aria-haspopup`, `aria-expanded`, and parent-child focus restoration?
- [ ] Should `neon-menu` ever support `menubar`, or should that become a separate component?
- [ ] Should typeahead stay intentionally removed, or move to an opt-in helper outside the component?
