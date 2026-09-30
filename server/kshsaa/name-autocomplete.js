// Player-name autocomplete shared by the reader and the stats page's game
// editor. It is a page fragment rather than a client file because those pages
// are single template literals with no build step; include it with
// ${NAME_AUTOCOMPLETE} ahead of the page's own script.
//
// Typing "samu" offers "Samuel Kuhn"; Enter takes the highlighted name and
// hands off to the page (usually to move on to the next box), so a lineup can
// be typed without touching the mouse. Tab never fills anything in, so a new
// player's name is never replaced by a similar existing one.
//
// No backslashes below: this whole file is a template literal (see AGENTS.md).

export const NAME_AUTOCOMPLETE = `
<style>
 .ac-list{position:absolute;z-index:1080;background:#fff;border:1px solid #ced4da;border-radius:.25rem;
   box-shadow:0 4px 12px rgba(0,0,0,.1);max-height:15rem;overflow-y:auto;font-size:.9rem;min-width:12rem}
 .ac-item{padding:.3rem .6rem;cursor:pointer;white-space:nowrap}
 .ac-item.on{background:#0d6efd;color:#fff}
</style>
<script>
var AC = { list: null, input: null, items: [], index: 0 };

/**
 * Names that match what has been typed: every typed word has to start one of
 * the name's words, so "sam k", "kuhn" and "samu" all find Samuel Kuhn.
 * @param {string} query
 * @param {string[]} names
 * @param {string[]} taken - names already used elsewhere on the form
 * @returns {string[]}
 */
function acMatches (query, names, taken) {
  var q = query.trim().toLowerCase();
  if (!q) return [];
  var tokens = q.split(' ').filter(Boolean);
  var skip = {};
  taken.forEach(function (t) { skip[String(t).trim().toLowerCase()] = true; });
  var scored = [];
  names.forEach(function (name) {
    var n = name.toLowerCase();
    if (skip[n] && n !== q) return;
    var words = n.split(/[ -]+/);
    var ok = n.indexOf(q) === 0 || tokens.every(function (t) {
      return words.some(function (w) { return w.indexOf(t) === 0; });
    });
    if (!ok) return;
    var score = n.indexOf(q) === 0 ? 0 : (words[0].indexOf(tokens[0]) === 0 ? 1 : 2);
    scored.push({ name: name, score: score });
  });
  scored.sort(function (a, b) { return a.score - b.score || a.name.localeCompare(b.name); });
  return scored.slice(0, 8).map(function (s) { return s.name; });
}

function acClose () {
  if (AC.list) AC.list.style.display = 'none';
  AC.items = [];
  AC.input = null;
}

function acRender () {
  var list = AC.list;
  list.innerHTML = '';
  AC.items.forEach(function (name, i) {
    var item = document.createElement('div');
    item.className = 'ac-item' + (i === AC.index ? ' on' : '');
    item.textContent = name;
    // mousedown, not click: a click would blur the input and close the list first
    item.onmousedown = function (e) {
      e.preventDefault();
      AC.index = i;
      acAccept(true);
    };
    list.appendChild(item);
  });
  var r = AC.input.getBoundingClientRect();
  list.style.left = (r.left + window.scrollX) + 'px';
  list.style.top = (r.bottom + window.scrollY + 2) + 'px';
  list.style.width = r.width + 'px';
  list.style.display = AC.items.length ? 'block' : 'none';
}

function acAccept (fromMouse) {
  var input = AC.input;
  if (!input) return;
  var picked = AC.items.length > 0;
  if (picked) input.value = AC.items[AC.index];
  var opts = input.acOptions;
  acClose();
  if (opts.onPick) opts.onPick(input, picked, fromMouse);
}

/**
 * @param {HTMLInputElement} input
 * @param {{names: function(): string[], taken?: function(): string[],
 *   onPick?: function(HTMLInputElement, boolean, boolean)}} opts
 *   onPick(input, pickedASuggestion, byMouse) runs after Enter or a click
 */
function attachNameAutocomplete (input, opts) {
  if (!AC.list) {
    AC.list = document.createElement('div');
    AC.list.className = 'ac-list';
    AC.list.style.display = 'none';
    document.body.appendChild(AC.list);
  }
  input.acOptions = opts;
  input.setAttribute('autocomplete', 'off');
  var refresh = function () {
    AC.input = input;
    AC.index = 0;
    AC.items = acMatches(input.value, opts.names(), opts.taken ? opts.taken(input) : []);
    // nothing to add when the box already holds exactly the one match
    if (AC.items.length === 1 && AC.items[0] === input.value.trim()) AC.items = [];
    acRender();
  };
  input.addEventListener('input', refresh);
  input.addEventListener('focus', function () { if (input.value.trim()) refresh(); });
  input.addEventListener('blur', function () { if (AC.input === input) acClose(); });
  input.addEventListener('keydown', function (e) {
    var open = AC.input === input && AC.items.length > 0;
    if (e.key === 'ArrowDown' && open) {
      AC.index = (AC.index + 1) % AC.items.length; acRender(); e.preventDefault();
    } else if (e.key === 'ArrowUp' && open) {
      AC.index = (AC.index - 1 + AC.items.length) % AC.items.length; acRender(); e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open) { acAccept(false); } else {
        acClose();
        if (opts.onPick) opts.onPick(input, false, false);
      }
    } else if (e.key === 'Escape') {
      // Escape means "keep what I typed": it closes the suggestions and never
      // reaches a dialog the box sits in, which would take the focus away
      acClose(); e.preventDefault(); e.stopPropagation();
    } else if (e.key === 'Tab') {
      acClose();
    }
  });
}
</script>`;
