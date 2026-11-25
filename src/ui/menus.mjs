// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
export function bindMenus() {
  const menus = [...document.querySelectorAll('.menu')];

  document.addEventListener('click', event => {
    for (const menu of menus) {
      if (!menu.contains(event.target) || event.target.closest('.menu-items button')) {
        menu.open = false;
      }
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    for (const menu of menus) {
      if (!menu.open || !menu.contains(event.target)) continue;
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
