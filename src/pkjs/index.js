// Claude Buddy — PebbleKit JS
// Polls the local HTTP server on the computer and relays state to the watch.
// Server default: http://<computer-ip>:9876

var KEY_STATUS     = 'STATUS';
var KEY_TOOL_NAME  = 'TOOL_NAME';
var KEY_TOOL_INPUT = 'TOOL_INPUT';
var KEY_RESPONSE   = 'RESPONSE';
var KEY_ANIM_FRAME = 'ANIM_FRAME';

var STATUS_IDLE     = 0;
var STATUS_THINKING = 1;
var STATUS_WAITING  = 2;

var serverUrl   = '';
var pollTimer   = null;
var lastStatus  = -1;
var animFrame   = 0;
var POLL_INTERVAL = 1500; // ms

// ── Settings ──────────────────────────────────────────────────────────────
Pebble.addEventListener('ready', function() {
  var stored = localStorage.getItem('server_url');
  serverUrl = stored || '';
  if (!serverUrl) {
    console.log('Claude Buddy: no server URL configured');
    return;
  }
  startPolling();
});

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) { clearInterval(pollTimer); }
  pollTimer = setInterval(poll, POLL_INTERVAL);
  poll(); // immediate first fetch
}

function poll() {
  if (!serverUrl) return;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', serverUrl + '/status', true);
  xhr.timeout = 1000;
  xhr.onload = function() {
    if (xhr.status !== 200) return;
    try {
      var data = JSON.parse(xhr.responseText);
      handleServerState(data);
    } catch (e) {
      console.log('Claude Buddy: bad JSON from server');
    }
  };
  xhr.onerror = xhr.ontimeout = function() {
    // Server unreachable — show idle so watch doesn't get stuck
    if (lastStatus !== STATUS_IDLE) {
      sendToWatch({ STATUS: STATUS_IDLE });
      lastStatus = STATUS_IDLE;
    }
  };
  xhr.send();
}

function handleServerState(data) {
  // data: { status: 'idle'|'thinking'|'waiting', tool: '', input: '' }
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

  // Only send if something changed (avoid spamming AppMessage)
  if (status !== lastStatus || status === STATUS_THINKING) {
    sendToWatch(msg);
    lastStatus = status;
  }
}

function sendToWatch(msg) {
  Pebble.sendAppMessage(msg,
    function() { /* ok */ },
    function(e) { console.log('Claude Buddy: sendAppMessage failed: ' + e.error.message); }
  );
}

// ── Responses from watch (0=deny, 1=allow, 2=allow always) ───────────────
Pebble.addEventListener('appmessage', function(e) {
  var response = e.payload[KEY_RESPONSE];
  if (response === undefined || !serverUrl) return;
  var xhr = new XMLHttpRequest();
  xhr.open('POST', serverUrl + '/respond', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify({ response: response }));
});

// ── Config page (set server URL) ──────────────────────────────────────────
Pebble.addEventListener('showConfiguration', function() {
  var current = localStorage.getItem('server_url') || 'http://192.168.0.x:9876';
  Pebble.openURL('data:text/html,' + encodeURIComponent(
    '<html><body style="font-family:sans-serif;padding:20px">' +
    '<h2>Claude Buddy</h2>' +
    '<p>Server URL (computer running server.js):</p>' +
    '<input id="url" type="text" style="width:100%;font-size:16px;padding:6px" value="' + current + '">' +
    '<br><br>' +
    '<button onclick="save()" style="font-size:16px;padding:8px 20px">Save</button>' +
    '<script>function save(){' +
    'var u=document.getElementById("url").value;' +
    'location.href="pebblejs://close#"+encodeURIComponent(JSON.stringify({url:u}));' +
    '}<\/script>' +
    '</body></html>'
  ));
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e.response) return;
  try {
    var data = JSON.parse(decodeURIComponent(e.response));
    if (data.url) {
      localStorage.setItem('server_url', data.url);
      serverUrl = data.url;
      startPolling();
    }
  } catch (err) {}
});
