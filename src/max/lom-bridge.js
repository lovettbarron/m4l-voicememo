// lom-bridge.js \u2014 Live Object Model bridge for VoiceMemo. Max [js], ES5.
autowatch = 1;
inlets = 1;
outlets = 1;

var trackPath = null;
var trackNumber = 0;
var hasFilePath = false;
var ready = false;
var last = {};

function stripQuotes(s) {
  return String(s).replace(/^"|"$/g, '');
}

function init() {
  var dev = new LiveAPI('this_device');
  var m = /^(live_set tracks (\d+))/.exec(stripQuotes(dev.path));
  trackPath = m ? m[1] : null;
  trackNumber = m ? Number(m[2]) + 1 : 0;
  var song = new LiveAPI('live_set');
  hasFilePath = String(song.info).indexOf('property file_path') >= 0;
  ready = true;
  last = {};
  refresh();
}

function emit(key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var sig = args.join(' ');
  if (last[key] === sig) return;
  last[key] = sig;
  outlet(0, [key].concat(args));
}

function findSlot() {
  if (!trackPath) return { ok: 0, label: 'Place on an audio track' };
  var track = new LiveAPI(trackPath);
  if (Number(track.get('has_midi_input')) === 1) return { ok: 0, label: 'Place on an audio track' };
  var start = 0;
  var hl = new LiveAPI('live_set view highlighted_clip_slot');
  var hm = / clip_slots (\d+)$/.exec(stripQuotes(hl.path));
  if (hm) start = Number(hm[1]);
  var count = track.getcount('clip_slots');
  for (var i = start; i < count; i++) {
    var slot = new LiveAPI(trackPath + ' clip_slots ' + i);
    if (Number(slot.get('has_clip')) === 0) {
      return { ok: 1, index: i, label: 'Track ' + trackNumber + ', slot ' + (i + 1) };
    }
  }
  return { ok: 0, label: 'No empty slot at or below the selected one' };
}

function refresh() {
  if (!ready) return;
  var song = new LiveAPI('live_set');
  emit('tempo', Number(song.get('tempo')), Number(song.get('signature_numerator')));
  if (hasFilePath) emit('setpath', stripQuotes([].concat(song.get('file_path')).join(' ')));
  var t = findSlot();
  emit('target', t.ok, t.label);
}

function bang() {
  refresh();
}

function resend() {
  last = {};
  refresh();
}

function pull() {
  var p = Array.prototype.slice.call(arguments).join(' ');
  var t = findSlot();
  if (!t.ok) {
    outlet(0, ['pullresult', 0, t.label]);
    return;
  }
  var slot = new LiveAPI(trackPath + ' clip_slots ' + t.index);
  slot.call('create_audio_clip', p);
  if (Number(slot.get('has_clip')) === 1) {
    outlet(0, ['pullresult', 1, 'Pulled to ' + t.label]);
    resend();
  } else {
    outlet(0, ['pullresult', 0, 'Clip not created. This needs Live 12.0.5 or later.']);
  }
}
