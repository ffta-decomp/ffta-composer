import { $ } from './controls.mjs';

export function createInspector() {
  const panel = $('#inspector');
  const form = $('#inspect-form');
  const fields = $('#inspect-fields');
  const title = $('#inspect-title');
  const error = $('#inspect-error');
  let opener;

  function close({ restoreFocus = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    fields.replaceChildren();
    form.onsubmit = null;
    opener?.removeAttribute('data-editing');
    if (restoreFocus) {
      const target = opener?.isConnected ? opener : $('#scene-title');
      target.focus({ preventScroll: true });
    }
    opener = undefined;
  }

  function open(label, content, apply) {
    const source = document.activeElement;
    close({ restoreFocus: false });
    opener = source instanceof HTMLButtonElement ? source : undefined;
    opener?.setAttribute('data-editing', '');
    title.textContent = label;
    fields.replaceChildren(...content);
    error.hidden = true;
    panel.hidden = false;
    panel.scrollTop = 0;
    form.onsubmit = event => {
      event.preventDefault();
      try {
        apply();
        close();
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
        error.scrollIntoView({ block: 'nearest' });
      }
    };
    const editors = [...fields.querySelectorAll('textarea, input, select')].filter(node => node.getClientRects().length);
    (editors.find(node => node.matches('textarea')) ?? editors[0] ?? $('#close-inspector')).focus({ preventScroll: true });
  }

  $('#close-inspector').onclick = () => close();
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  return { open, close };
}
