// memo-list.js \u2014 scrollable two-line memo list. Max [jsui], ES5.
include('theme.js');
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;
inlets = 1;
outlets = 1;

var ROW = 28;
var items = [];
var visible = [];
var filterText = '';
var selectedId = null;
var scroll = 0;
var dragStartY = null;
var dragScroll = 0;
var dragged = false;
loadTheme();

function size() {
  return [box.rect[2] - box.rect[0], box.rect[3] - box.rect[1]];
}
function clampScroll() {
  var h = size()[1];
  var max = Math.max(0, visible.length * ROW - h);
  scroll = Math.max(0, Math.min(max, scroll));
}
function theme() {
  loadTheme();
  mgraphics.redraw();
}
function memos(name) {
  items = readDict(arguments).items || [];
  applyFilter();
}
function filter() {
  filterText = Array.prototype.slice.call(arguments).join(' ').toLowerCase();
  applyFilter();
}
function applyFilter() {
  visible = [];
  for (var i = 0; i < items.length; i++) {
    if (!filterText || String(items[i].title).toLowerCase().indexOf(filterText) >= 0) visible.push(items[i]);
  }
  clampScroll();
  mgraphics.redraw();
}
function select() {
  selectedId = Array.prototype.slice.call(arguments).join(' ');
  for (var i = 0; i < visible.length; i++) {
    if (visible[i].id === selectedId) scroll = i * ROW - ROW;
  }
  clampScroll();
  mgraphics.redraw();
}

function paint() {
  var s = size();
  var w = s[0];
  var h = s[1];
  setColor(THEME.bg);
  mgraphics.rectangle(0, 0, w, h);
  mgraphics.fill();
  if (!visible.length) {
    text(items.length ? 'No memos match that filter' : 'No memos yet', 8, 18, 10, THEME.dim, false);
    return;
  }
  for (var i = 0; i < visible.length; i++) {
    var y = i * ROW - scroll;
    if (y + ROW < 0 || y > h) continue;
    var m = visible[i];
    var sel = m.id === selectedId;
    var cloud = m.status !== 'local';
    if (sel) {
      setColor(withAlpha(THEME.accent, 0.18));
      mgraphics.rectangle(0, y, w, ROW - 1);
      mgraphics.fill();
      setColor(THEME.accent);
      mgraphics.rectangle(0, y, 2, ROW - 1);
      mgraphics.fill();
    }
    var main = cloud ? THEME.dim : sel ? THEME.title : THEME.fg;
    var dur = fmtTime(m.duration, 0);
    var durW = textWidth(dur, 10, false);
    var title = String(m.title);
    while (title.length > 1 && textWidth(title, 10, sel) > w - durW - 18) title = title.slice(0, -2) + '\u2026';
    text(title, 7, y + 12, 10, main, sel);
    text(dur, w - durW - 6, y + 12, 10, THEME.dim, false);
    text(fmtDate(m.date) + (cloud ? '   In iCloud only' : ''), 7, y + 24, 9, THEME.dim, false);
  }
  if (visible.length * ROW > h) {
    var barH = Math.max(12, (h * h) / (visible.length * ROW));
    var barY = (scroll / (visible.length * ROW - h)) * (h - barH);
    setColor(withAlpha(THEME.fg, 0.25));
    mgraphics.rectangle(w - 3, barY, 2, barH);
    mgraphics.fill();
  }
}

function onclick(x, y) {
  dragStartY = y;
  dragScroll = scroll;
  dragged = false;
}
function ondrag(x, y, button) {
  if (dragStartY === null) return;
  if (Math.abs(y - dragStartY) > 3) dragged = true;
  if (dragged) {
    scroll = dragScroll - (y - dragStartY);
    clampScroll();
    mgraphics.redraw();
  }
  if (!button) {
    if (!dragged) {
      var i = Math.floor((dragStartY + scroll) / ROW);
      if (i >= 0 && i < visible.length) {
        selectedId = visible[i].id;
        mgraphics.redraw();
        outlet(0, 'select', selectedId);
      }
    }
    dragStartY = null;
  }
}
function onwheel(x, y, dx, dy) {
  scroll -= dy * 40;
  clampScroll();
  mgraphics.redraw();
}
