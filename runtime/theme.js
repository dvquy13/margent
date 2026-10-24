// Page-level theme toggle. The shell must provide a <button id="theme-toggle">; the button sets data-theme on <html>.
// Its label names the theme it switches to. Islands refresh their tokens from host.js (watchTheme).
(function () {
  'use strict';

  var btn = document.getElementById('theme-toggle');
  if (!btn) throw new Error('theme.js: the page has no #theme-toggle button, so the theme cannot be switched');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function effective() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return systemDark.matches ? 'dark' : 'light';
  }
  function label() {
    var next = effective() === 'dark' ? 'light' : 'dark';
    btn.textContent = next === 'light' ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
  }
  btn.addEventListener('click', function () {
    document.documentElement.setAttribute('data-theme', effective() === 'dark' ? 'light' : 'dark');
    label();
  });
  systemDark.addEventListener('change', label);
  label();
})();
