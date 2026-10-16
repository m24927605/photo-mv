(function (root) {
  function axis(value, size, limit, targets, threshold) {
    let position = value, guide = null, nearest = threshold;
    for (const target of targets) for (const offset of [0, size / 2, size]) {
      const candidate = target - offset, distance = Math.abs(candidate - value);
      if (candidate >= 0 && candidate <= limit && distance < nearest) {
        position = candidate; guide = target; nearest = distance;
      }
    }
    return {position, guide};
  }
  function move(text, dx, dy, bounds, targets, threshold) {
    const maxX = Math.max(0, 1 - bounds.width), maxY = Math.max(0, 1 - bounds.height);
    const x = axis(Math.max(0, Math.min(maxX, text.x + dx)), bounds.width, maxX, targets.x, threshold.x);
    const y = axis(Math.max(0, Math.min(maxY, text.y + dy)), bounds.height, maxY, targets.y, threshold.y);
    return {text: {...text, x: x.position, y: y.position}, vertical: x.guide, horizontal: y.guide};
  }
  root.TextAlignment = {move};
  if (typeof module !== 'undefined') module.exports = root.TextAlignment;
})(globalThis);
