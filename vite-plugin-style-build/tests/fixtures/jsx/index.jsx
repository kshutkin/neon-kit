import styles from '@neon-kit/slice-theme/control.module.css';

export function Control() {
    return <label class={styles.control}>
        <input class={styles.input} aria-label="JSX value" value="JSX" />
        <button class={styles.action} type="button">Apply</button>
    </label>;
}
