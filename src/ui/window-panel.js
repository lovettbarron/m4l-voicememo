// window-panel.js \u2014 window range, analysis readouts, pull target and status. Max [jsui], ES5.
include('theme.js');
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;
inlets = 1;
outlets = 0;

var info = null;
var tgt = null;
var stat = null;
var statTask = new Task(function () { stat = null; mgraphics.redraw(); });
loadTheme();

function theme() { loadTheme(); mgraphics.redraw(); }
function windowinfo(name) { info = readDict(arguments); mgraphics.redraw(); }
function target(name) { tgt = readDict(arguments); mgraphics.redraw(); }
function status(name) {
  stat = readDict(arguments);
  statTask.cancel();
  statTask.schedule(4000);
  mgraphics.redraw();
}

function db(v) {
  return v === null || v === undefined || v <= -120 ? '-\u221e' : v.toFixed(1);
}

function paint() {
  var w = box.rect[2] - box.rect[0];
  var h = box.rect[3] - box.rect[1];
  setColor(THEME.bg);
  mgraphics.rectangle(0, 0, w, h);
  mgraphics.fill();
  if (info) {
    var a = info.analysis || {};
    text(fmtTime(info.start, 1) + ' \u2013 ' + fmtTime(info.end, 1), 6, 14, 11, THEME.title, true);
    var len = info.length.toFixed(1) + ' s, ' + info.bars.toFixed(1) + ' bars';
    text(len, 6, 28, 10, THEME.fg, false);
    var ld = a.loudness;
    text('Peak ' + (ld ? db(ld.peakDb) : '\u2014') + '   RMS ' + (ld ? db(ld.rmsDb) : '\u2014') + ' dB', 6, 44, 10, THEME.fg, false);
    var bpm = a.tempo && a.tempo.bpm ? 'Tempo \u2248 ' + Math.round(a.tempo.bpm) : 'Tempo \u2014';
    var key = a.pitch && a.pitch.key ? 'Key \u2248 ' + a.pitch.key.replace('minor', 'min').replace('major', 'maj') : 'Key \u2014';
    text(bpm + '   ' + key, 6, 58, 10, THEME.fg, false);
    var cl = a.classify;
    var label = cl && cl.label !== 'unknown' ? 'Sounds like ' + cl.label + ' (' + Math.round(cl.confidence * 100) + '%)' : 'Speech or music unclear';
    text(label, 6, 72, 10, THEME.fg, false);
  } else {
    text('Choose a memo, then a window.', 6, 30, 10, THEME.dim, false);
  }
  setColor(THEME.frame);
  mgraphics.rectangle(6, 86, w - 12, 1);
  mgraphics.fill();
  if (stat) {
    text(stat.message, 6, 100, 10, stat.level === 'ok' ? THEME.accent : THEME.alert, true);
  } else if (tgt) {
    text(tgt.ok ? 'Pulls to ' + tgt.label : tgt.label, 6, 100, 10, tgt.ok ? THEME.fg : THEME.alert, !tgt.ok);
  }
}
