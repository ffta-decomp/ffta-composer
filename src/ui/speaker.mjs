// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — see LICENSE and NOTICE for reuse and attribution.
import {t,tr} from '../i18n.mjs';
export function speakerLabel(info) {
  if(!info)return t('说话者未指定');
  const handle=tr`角色 ${info.handle}`;
  return info.name ? `${t(info.name)} · ${handle}` : handle;
}
