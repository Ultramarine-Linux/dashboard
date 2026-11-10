/**
 * Keeps the ui.sh picker usable above shadcn-svelte sheets and dialogs. Events
 * from inside the picker stop before they reach the document, so bits-ui's
 * DismissibleLayer doesn't take them as "interact outside" and close the sheet,
 * which would also remove the content the picker previews.
 */

(function () {

  const PICKER_TAG = 'uidotsh-picker';
  const Z_ABOVE = '9999';

  function stopPropagation(e) {
    e.stopPropagation();
  }

  const STOP_EVENTS = ['pointerdown', 'mousedown', 'click', 'touchstart', 'focusin'];

  function attachPatch(picker) {
    picker.style.zIndex = Z_ABOVE;
    picker.style.pointerEvents = 'auto';

    // Move picker to end of body so it's above sheet overlays in DOM order
    if (picker.parentElement !== document.body) {
      document.body.appendChild(picker);
    }

    for (const event of STOP_EVENTS) {
      picker.addEventListener(event, stopPropagation, false);
    }

    // Keep z-index and pointer-events pinned if uidotsh resets them
    new MutationObserver(() => {
      if (picker.style.zIndex !== Z_ABOVE) {
        picker.style.zIndex = Z_ABOVE;
      }
      if (picker.style.pointerEvents !== 'auto') {
        picker.style.pointerEvents = 'auto';
      }
    }).observe(picker, { attributes: true, attributeFilter: ['style'] });
  }

  function init() {
    const existing = document.querySelector(PICKER_TAG);
    if (existing) { attachPatch(existing); return; }

    new MutationObserver((_, mo) => {
      const picker = document.querySelector(PICKER_TAG);
      if (picker) { mo.disconnect(); attachPatch(picker); }
    }).observe(document.documentElement, { subtree: true, childList: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();

})();