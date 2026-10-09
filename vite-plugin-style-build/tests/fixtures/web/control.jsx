import { defineElement, shadowStyles } from '@slimlib/element';
import { sheets as base } from '@neon-kit/slice-theme/shadow-base.css?neon';
import { control, input, action, sheets } from '@neon-kit/slice-theme/control.module.css?neon';

defineElement('neon-slice-control', [shadowStyles([...base, ...sheets])], () =>
    <label class={control}>
        <input class={input} aria-label="Shadow value" value="Shadow" />
        <button class={action} type="button">Apply</button>
    </label>
);
