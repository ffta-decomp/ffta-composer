// Copyright (C) 2026 hitsmaxft. SPDX-License-Identifier: GPL-3.0-only
// FFTA Composer — https://github.com/ffta-decomp/ffta-composer ; see LICENSE and NOTICE.
// Original isometric diorama drawn at integer coordinates for the opening screen.
const ground = ['#6d8151', '#829059', '#778950', '#949b5d'];
const gravel = ['#aa9567', '#b3a26b', '#bfa879'];

export function drawTerrain(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const polygon = (color, points) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
  };
  const rock = (x, y) => {
    polygon('#415043', [[x - 8, y], [x + 1, y - 6], [x + 9, y - 2], [x + 5, y + 4], [x - 6, y + 4]]);
    polygon('#9c9e79', [[x - 8, y], [x + 1, y - 6], [x + 9, y - 2], [x - 1, y + 1]]);
  };
  const pine = (x, y, height) => {
    ctx.fillStyle = '#554935';
    ctx.fillRect(x - 2, y - 8, 4, 9);
    for (const [offset, width] of [[0, 10], [7, 8], [14, 5]]) {
      const tip = y - height - 10 - offset;
      const base = y - 4 - offset;
      polygon('#243e32', [[x, tip], [x + width, base], [x, base + 3], [x - width, base]]);
      polygon('#536948', [[x, tip], [x, base + 3], [x - width, base]]);
    }
  };
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 9; column++) {
      const x = 145 + (column - row) * 15;
      const y = 21 + (column + row) * 8;
      const height = 8 + Math.max(0, 3 - column) * 4 + (row < 2 ? 4 : 0);
      const edge = y + height;
      const seed = (row * 13 + column * 17 + row * column * 3);
      const path = row === 3 || (column === 5 && row > 3);
      const colors = path ? gravel : ground;
      polygon('#354b39', [[x, y], [x - 15, y + 8], [x - 15, edge + 8], [x, edge + 16]]);
      polygon('#263d34', [[x, y], [x + 15, y + 8], [x + 15, edge + 8], [x, edge + 16]]);
      polygon(colors[seed % colors.length], [[x, y], [x + 15, y + 8], [x, y + 16], [x - 15, y + 8]]);
      if (path || seed % 3 === 0) {
        ctx.fillStyle = path ? '#d7c291' : '#a8ac6b';
        ctx.fillRect(x - 5, y + 7, 3, 1);
        ctx.fillRect(x + 3, y + 10, 2, 1);
      }
      if (!path && seed % 7 === 0 && row > 0) pine(x, y + 10, seed % 8);
      else if (!path && seed % 5 === 0) rock(x, y + 10);
    }
  }
}
