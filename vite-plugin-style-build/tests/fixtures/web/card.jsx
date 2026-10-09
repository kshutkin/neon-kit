import { defineElement, shadowStyles } from '@slimlib/element';
import { sheets as base } from '@neon-kit/slice-theme/shadow-base.css?neon';
import { card, sheets } from '@neon-kit/slice-theme/card.module.css?neon';

defineElement('neon-slice-card', [shadowStyles([...base, ...sheets])], () =>
    <div class={card}>Lazy card</div>
);
