// theme.js \u2014 Live theme colours for VoiceMemo jsui scripts. ES5.
// max.getcolor() reads Live's dynamic colours (Max 8.2+); fallbacks match Live's dark theme.
var THEME = {};
function themeColor(name, fallback) {
  try {
    var c = max.getcolor(name);
    if (c && c.length >= 3) return [c[0], c[1], c[2], c.length > 3 ? c[3] : 1];
  } catch (e) {}
  return fallback;
}
function loadTheme() {
  THEME.bg = themeColor('live_lcd_bg', [0.09, 0.09, 0.1, 1]);
  THEME.frame = themeColor('live_lcd_frame', [0.22, 0.22, 0.24, 1]);
  THEME.fg = themeColor('live_lcd_control_fg', [0.86, 0.86, 0.86, 1]);
  THEME.dim = themeColor('live_lcd_passive', [0.48, 0.48, 0.5, 1]);
  THEME.accent = themeColor('live_lcd_control_fg_alt', [1.0, 0.66, 0.2, 1]);
  THEME.title = themeColor('live_lcd_title', [0.95, 0.95, 0.95, 1]);
  THEME.alert = [0.93, 0.38, 0.38, 1];
}
function withAlpha(c, a) {
  return [c[0], c[1], c[2], a];
}
function setColor(c) {
  mgraphics.set_source_rgba(c[0], c[1], c[2], c[3]);
}
// Live's own UI face; mgraphics falls back to the system font if it isn't registered.
var FONT = 'Ableton Sans Small';
function text(str, x, y, size, color, bold) {
  mgraphics.select_font_face(FONT, 'normal', bold ? 'bold' : 'normal');
  mgraphics.set_font_size(size);
  setColor(color);
  mgraphics.move_to(x, y);
  mgraphics.show_text(String(str));
}
function textWidth(str, size, bold) {
  mgraphics.select_font_face(FONT, 'normal', bold ? 'bold' : 'normal');
  mgraphics.set_font_size(size);
  return mgraphics.text_measure(String(str))[0];
}
// Handlers pass their arguments object: Max may deliver 'dictionary <name>' or just '<name>'.
function readDict(args) {
  var d = new Dict(args[args.length - 1]);
  return JSON.parse(d.stringify());
}
function fmtTime(s, decimals) {
  if (s === null || s === undefined || isNaN(s)) return '';
  var neg = s < 0;
  s = Math.abs(s);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  var secStr = decimals ? sec.toFixed(decimals) : String(Math.floor(sec));
  if (Number(secStr) < 10) secStr = '0' + secStr;
  var out = (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + secStr;
  return (neg ? '-' : '') + out;
}
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}
