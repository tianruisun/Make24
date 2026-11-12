/* Shows "TEST vX.Y.Z" on every host that is not Production, so the Test app cannot be mistaken for it. */
(function () {
  if ((self.PRODUCTION_HOSTS || []).indexOf(location.hostname) !== -1) return;
  const style = document.createElement('style');
  style.textContent =
    '#testBadge{position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translateX(-50%);' +
    'z-index:9999;pointer-events:none;padding:0 8px;border-radius:0 0 6px 6px;background:#dc2626;color:#fff;' +
    'font:700 10px/1.5 system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
    '@media print{#testBadge{display:none}}';
  const badge = document.createElement('div');
  badge.id = 'testBadge';
  badge.textContent = 'TEST v' + self.APP_VERSION;
  document.head.appendChild(style);
  document.body.appendChild(badge);
})();
