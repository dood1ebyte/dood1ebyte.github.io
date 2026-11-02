// Counts page loads, Consortium Finder searches and clicks from this site to EU Tender Radar, with keyless public hit
// counters (E-023 measurement; attribution for E-019 and E-024). Sent: one request per event to the counter service,
// keyed by event and UTC date. Not sent: anything typed, cookies, identifiers. The lab's own checks open pages with
// ?internal=1, which turns counting off in that browser. Off the live host nothing is sent; the URLs are only logged in
// window.avlCountLog (used by the tests).
(function () {
  var SITE = 'dood1ebyte.github.io';
  var off = /[?&]internal=1(&|$)/.test(location.search);
  try {
    if (off) localStorage.setItem('avl-internal', '1');
    off = off || localStorage.getItem('avl-internal') === '1';
  } catch (e) { /* storage blocked: the URL flag alone decides */ }
  var live = location.hostname === SITE;
  var log = (window.avlCountLog = []);
  var sent = 0;
  function send(u) {
    log.push(u);
    if (!live) return;
    try {
      // keepalive lets the request of a click finish while the browser navigates away.
      fetch(u, { mode: 'no-cors', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(function () {});
    } catch (e) {
      var img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = u;
    }
  }
  function count(name, backup) {
    if (off || sent >= 50) return; // at most 50 events per page load
    sent++;
    var key = SITE + '/_count/' + name + '/' + new Date().toISOString().slice(0, 10);
    send('https://hitscounter.dev/api/hit?url=' + encodeURIComponent('https://' + key) + '&output=svg');
    if (backup) send('https://hits.sh/' + key + '.svg');
  }
  window.avlCount = count;
  var page = location.pathname.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '') || 'home';
  count('load/' + page);
  // Attribution: a click from this site to EU Tender Radar's Apify page (the only way a site visitor reaches it).
  function outbound(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && /^https:\/\/apify\.com\/doodlebyte\/eu-tender-radar(\/|\?|#|$)/.test(a.href)) count('out/eu-tender-radar/' + page);
  }
  document.addEventListener('click', outbound, true);
  document.addEventListener('auxclick', outbound, true);
})();
