# Menu Accessibility Checklist

Source: [WAI-ARIA APG Menu and Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)

Use this as a working checklist for the `neon-menu` component. Items are grouped by current fit: implemented, partial, not implemented, and not applicable or consumer-owned.

## Implemented

- [x] Menu container has a default `menu` role through ElementInternals.
- [x] `<neon-menu-item>` has a default `menuitem` role through ElementInternals.
- [x] Each `<neon-menu>` queries its Light-DOM descendants and owns the `<neon-menu-item>` elements whose nearest ancestor menu is that menu.
- [x] The menu uses roving `tabindex` so one menu item is in the tab sequence at a time.
- [x] Opening a popover menu moves focus to the first menu item.
- [x] `ArrowDown` moves focus to the next menu item.
- [x] `ArrowUp` moves focus to the previous menu item.
- [x] Arrow-key navigation wraps from the last item to the first.
- [x] Arrow-key navigation wraps from the first item to the last.
- [x] `Home` moves focus to the first menu item.
- [x] `End` moves focus to the last menu item.
- [x] `Enter` activates an enabled focused item by dispatching its click behavior.
- [x] `Space` activates an enabled focused item by dispatching its click behavior.
- [x] Disabled menu items participate in roving focus but cannot be activated.
- [x] Disabled menu items do not activate on click.
- [x] `<neon-menu-item>` reflects `disabled` and `aria-disabled="true"` to accessible disabled state.
- [x] `<neon-menu-item>` can act as a popover trigger for nested menu composition.
- [x] `<neon-menu-item popovertarget>` manages `aria-haspopup` for submenu trigger items.
- [x] `<neon-menu-item popovertarget>` manages `aria-expanded` for submenu trigger items.
- [x] Elements that are not owned `<neon-menu-item>` descendants are ignored by keyboard navigation.
- [x] `Escape` closes an open popover menu and restores focus through browser popover behavior.
- [x] Focus restore fills the native popover gap when focus remains inside a closing menu and a valid trigger or invoker is available.
- [x] Leaf menu item activation closes all open popover menus in the same root menu tree.
- [x] Nested menus share root menu context when the child menu is authored inside its triggering menu item.
- [x] `Right Arrow` opens the focused item's submenu and moves focus to its first item.
- [x] `Left Arrow` closes a submenu and returns focus to its parent menu item.
- [x] A popover menu without a consumer-authored name uses `aria-labelledby` to reference its trigger.
- [x] Consumer-authored `aria-label` and `aria-labelledby` values take precedence over component-managed naming.

## Partially Implemented

No partially implemented checklist items remain.

## Not Implemented

- [ ] `menubar` role.
- [ ] Horizontal menubar keyboard behavior.
- [ ] `Right Arrow` behavior for moving through menubar items.
- [ ] `Left Arrow` behavior for moving through menubar items.
- [ ] Menubar submenu opening from arrow-key navigation.
- [ ] Printable-character typeahead.
- [ ] `menuitemcheckbox` role support.
- [ ] `menuitemradio` role support.
- [ ] Component-managed `aria-checked`.
- [ ] Component-managed `aria-controls` or trigger-to-menu relationship wiring.
- [ ] Component-managed `aria-orientation`.
- [ ] `aria-activedescendant` focus strategy.
- [ ] `Tab` behavior that closes all open menus when focus leaves a menu or menubar.

## Not Applicable Or Consumer-Owned

- [ ] Desktop application menubar semantics are not a current `neon-menu` goal.
- [ ] Persistent menubar behavior is not a current `neon-menu` goal.
- [ ] `Shift + F10` context-menu invocation is outside the current component behavior.
- [ ] Ellipsis naming convention for items that open dialogs is content guidance for consumers.
- [ ] Separator roles and semantics are authored by consumers.
- [ ] Menu item roles beyond plain `menuitem` are authored by consumers until the component has first-class checkbox or radio menu items.
- [ ] Visual submenu indicators, such as a static chevron, are styling and markup authored by consumers.

## Open Refinement Questions

- [ ] Should `neon-menu` ever support `menubar`, or should that become a separate component?
- [ ] Should typeahead stay intentionally removed, or move to an opt-in helper outside the component?
