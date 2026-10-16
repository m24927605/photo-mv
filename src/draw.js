(function (root) {
  function textFont(t, height) {
    return `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size * height}px "${t.font}"`;
  }
  function textBounds(canvas, t) {
    const c = canvas.getContext('2d');
    c.font = textFont(t, canvas.height);
    const lines = t.value.split('\n');
    return {
      width: Math.max(t.size * canvas.height, ...lines.map(line => {
        const metrics = c.measureText(line);
        return Math.max(metrics.width, metrics.actualBoundingBoxRight) + Math.max(0, metrics.actualBoundingBoxLeft);
      })),
      height: lines.length * t.size * canvas.height * 1.25
    };
  }
  function draw(canvas, image, slide) {
    const c = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    if (image) {
      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
      c.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    }
    drawTexts(canvas, slide?.texts || []);
  }
  function drawTexts(canvas, texts) {
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    c.textBaseline = 'alphabetic';
    for (const t of texts) {
      c.font = textFont(t, h);
      c.fillStyle = t.color;
      const size = t.size * h, lineHeight = size * 1.25;
      const metrics = c.measureText('中文Hg');
      const baseline = (lineHeight - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
      t.value.split('\n').forEach((line, i) => {
        const y = t.y * h + baseline + i * lineHeight;
        c.fillText(line, t.x * w, y);
        if (t.underline) c.fillRect(t.x * w, y + size * .1, c.measureText(line).width, Math.max(1, size / 18));
      });
    }
  }
  root.drawSlide = draw;
  root.drawTexts = drawTexts;
  root.textBounds = textBounds;
  root.textFont = textFont;
})(globalThis);
