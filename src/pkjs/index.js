// Claude Buddy — PebbleKit JS
var Clay = require('pebble-clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var KEY_STATUS     = 'STATUS';
var KEY_TOOL_NAME  = 'TOOL_NAME';
var KEY_TOOL_INPUT = 'TOOL_INPUT';
var KEY_RESPONSE   = 'RESPONSE';
var KEY_ANIM_FRAME = 'ANIM_FRAME';

var STATUS_IDLE     = 0;
var STATUS_THINKING = 1;
var STATUS_WAITING  = 2;

var serverUrl     = '';
var pollTimer     = null;
var lastStatus    = -1;
var animFrame     = 0;
var POLL_INTERVAL = 1500;

// ── Ready ─────────────────────────────────────────────────────────────────
Pebble.addEventListener('ready', function() {
  serverUrl = localStorage.getItem('server_url') || 'https://appraiser-aviation-polka.ngrok-free.dev';
  startPolling();
});

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, POLL_INTERVAL);
  poll();
}

function poll() {
  if (!serverUrl) return;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', serverUrl + '/status', true);
  xhr.timeout = 1000;
  xhr.onload = function() {
    if (xhr.status !== 200) return;
    try { handleServerState(JSON.parse(xhr.responseText)); }
    catch (e) {}
  };
  xhr.onerror = xhr.ontimeout = function() {
    if (lastStatus !== STATUS_IDLE) {
      sendToWatch({ STATUS: STATUS_IDLE });
      lastStatus = STATUS_IDLE;
    }
  };
  xhr.send();
}

function handleServerState(data) {
  var statusMap = { idle: STATUS_IDLE, thinking: STATUS_THINKING, waiting: STATUS_WAITING };
  var status = (statusMap[data.status] !== undefined) ? statusMap[data.status] : STATUS_IDLE;

  if (status === STATUS_THINKING || status === STATUS_WAITING) {
    animFrame = (animFrame + 1) % 12;
  }

  var msg = {};
  msg[KEY_STATUS]     = status;
  msg[KEY_ANIM_FRAME] = animFrame;

  if (status === STATUS_WAITING) {
    msg[KEY_TOOL_NAME]  = (data.tool  || '').substring(0, 30);
    msg[KEY_TOOL_INPUT] = (data.input || '').substring(0, 60);
  }

  if (status !== lastStatus || status === STATUS_THINKING) {
    sendToWatch(msg);
    lastStatus = status;
  }
}

function sendToWatch(msg) {
  Pebble.sendAppMessage(msg,
    function() {},
    function(e) { console.log('Claude Buddy: sendAppMessage failed: ' + e.error.message); }
  );
}

// ── Watch → server (approve / deny) ──────────────────────────────────────
Pebble.addEventListener('appmessage', function(e) {
  var response = e.payload[KEY_RESPONSE];
  if (response === undefined || !serverUrl) return;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', serverUrl + '/respond', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify({ response: response }));
});

// ── Clay config page ──────────────────────────────────────────────────────
Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e.response) return;
  var settings = clay.getSettings(e.response);
  var url = settings.SERVER_URL ? settings.SERVER_URL.value : '';
  if (url) {
    localStorage.setItem('server_url', url);
    serverUrl = url;
    startPolling();
  }
});
