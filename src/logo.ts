// Draws the BLOODRITE logo into a canvas using the bundled (OFL) Pirata One font.
export function drawLogo(w = 1520, h = 440): string {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const cx = w / 2, base = h * 0.62;
  // thorn halo
  g.save(); g.translate(cx, h * 0.48); g.strokeStyle = 'rgba(120,10,0,.55)'; g.lineWidth = 6;
  g.beginPath(); g.ellipse(0, 0, w * 0.42, h * 0.38, 0, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2; const x = Math.cos(a) * w * 0.42, y = Math.sin(a) * h * 0.38; g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.fillStyle = 'rgba(140,14,0,.7)'; g.beginPath(); g.moveTo(-6, 0); g.lineTo(0, -22 - (i % 3) * 8); g.lineTo(6, 0); g.fill(); g.restore(); }
  g.restore();
  // horns
  for (const s of [-1, 1]) { g.save(); g.translate(cx + s * w * 0.06, h * 0.2); g.scale(s, 1); const gr = g.createLinearGradient(0, 0, 160, -120); gr.addColorStop(0, '#6d5a40'); gr.addColorStop(1, '#f2e6c8');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(60, 20, 140, -10, 190, -110); g.bezierCurveTo(150, -40, 80, 0, 20, 60); g.closePath(); g.fill(); g.restore(); }
  g.font = `${Math.round(h * 0.52)}px 'Pirata One', serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const txt = 'BLOODRITE';
  g.save(); g.shadowColor = '#ff2000'; g.shadowBlur = 40; g.fillStyle = '#300'; g.fillText(txt, cx, base + 8); g.restore();
  const grad = g.createLinearGradient(0, base - h * 0.42, 0, base + 10); grad.addColorStop(0, '#ffe2a0'); grad.addColorStop(0.35, '#ff6a2a'); grad.addColorStop(0.6, '#c4120c'); grad.addColorStop(1, '#3a0000');
  g.fillStyle = grad; g.fillText(txt, cx, base); g.lineWidth = 3; g.strokeStyle = '#1a0000'; g.strokeText(txt, cx, base);
  // blood drips from the letters
  const m = g.measureText(txt); const x0 = cx - m.width / 2;
  let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) { const x = x0 + r() * m.width, len = 20 + r() * 70, wd = 4 + r() * 6; const gr = g.createLinearGradient(0, base - 10, 0, base + len); gr.addColorStop(0, '#8a0000'); gr.addColorStop(1, '#ff1a0a');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - wd / 2, base - 12); g.lineTo(x + wd / 2, base - 12); g.lineTo(x + wd * 0.35, base + len); g.arc(x, base + len, wd * 0.55, 0, Math.PI); g.closePath(); g.fill(); }
  g.font = `${Math.round(h * 0.075)}px 'Cinzel', serif`; g.fillStyle = '#d8b878'; g.shadowColor = '#000'; g.shadowBlur = 8;
  (g as any).letterSpacing = '14px'; g.fillText('RITES  OF  DAMNATION', cx, h * 0.86);
  return c.toDataURL('image/png');
}
