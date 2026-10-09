import { render } from '@slimlib/jsx';
import { Control } from '@neon-kit/slice-jsx';
import '@neon-kit/slice-web/control';

render(() => <Control />, document.getElementById('jsx'));
document.getElementById('lazy').addEventListener('click', async () => {
    await import('@neon-kit/slice-web/card');
    document.getElementById('cards').append(document.createElement('neon-slice-card'));
});
window.sliceReady = true;
