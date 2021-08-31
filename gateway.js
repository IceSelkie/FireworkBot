const WebSocket = require("ws").WebSocket;
var ws = null;
const identify = {"op":2,"d":{"intents":32767,"properties":{"$os":"macos","$browser":"node","$device":"firework"},"token":"TOKEN"}};
var lastHeartbeat = null;
var types = new Map();
var heap = new Map();
var contacts = [];
var print = false;
var heartbeatThread = 0;
var connectionAlive = false;

send = function(message) {
  console.log("Sending:")
  console.log(message)
  if (connectionAlive)
    ws.send(JSON.stringify(message, null));
  else
    console.log("Failed to send. Connection is dead.")
}
heartbeat = function(interval, thread) {
  if (thread !== heartbeatThread) {
    console.log("Planned heartbeat for heartbeatThread " + thread + " already complete. Stopping thread...");
    return;
  }
  if (!connectionAlive) {
    console.log("Planned heartbeat for heartbeatThread " + thread + " cancelled. Connection is dead.");
    return;
  }
  console.log("Ba-Bum. Heartbeat sent for message " + lastHeartbeat + ".")
  ws.send(JSON.stringify({"op":1,"d":lastHeartbeat},null));
  setTimeout(() => heartbeat(interval, thread), interval);
}
online = function() {
  // Update Presence
  send({"op":3,"d":{"status":"online","afk":false,"activities":[],"since":null}});
}
dnd = function() {
  // Update Presence
  send({"op":3,"d":{"status":"dnd","afk":false,"activities":[],"since":null}});
}
invis = function() {
  // Update Presence
  send({"op":3,"d":{"status":"invisible","afk":false,"activities":[],"since":null}});
}
idle = function() {
  // Update Presence
  send({"op":3,"d":{"status":"idle","afk":true,"activities":[],"since":null}});
}
rgm = function(gid, query = '', limit = 0) {
  // Request guild members
  // limit of 0 = 1000 for no query
  //              or 100 for query
  //              or 100 for specific users.
}
rgm1 = function(gid, snowflakes) {
  // request guild members specific
  // limit of 100 per request.
}

hasInterest = function(string) {
  ret = [];
  if (string.includes("163718745888522241")) ret.push("S");

  if (ret.length == 0) return "";
  retstr = " [";
  for (let i = 0; i < ret.length - 1; i++)
    retstr += ret[i] + ",";
  return retstr + ret[ret.length - 1] + "]"
}

get = function(s) {
  console.log(JSON.stringify(contacts[s], null, 2));
}

start = function(sid = null) {
  ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

  ws.on('open', function open() {
    connectionAlive = true;
    if (sid === null)
      send(identify)
    else
      send({"op":6,"d":{"token":identify.d.token,"session_id":sid,"seq":lastHeartbeat}})
  });

  ws.on('close', function close(errcode, buffer, c, d) {
    connectionAlive = false;
    console.log('disconnected:');
    console.log(errcode);
    console.log('"' + buffer.toString() + '"');

    if (errcode === 1001 && buffer.toString() === "Discord WebSocket requesting client reconnect.") {
      start(sessionID);
    }
  });

  ws.on('message', function incoming(message) {
    // console.log('recieved:');
    message = JSON.parse(message);
    messagestr = JSON.stringify(message, null, 2);
    if (print) console.log(messagestr);

    if (message.s === null) {
      console.log("Recieved message (none/heartbeat-ack)");
      console.log(message)
    } else {
      while (contacts.length < message.s)
        contacts.push(null);
      contacts[message.s] = message;
      // console.log("Recieved message #"+message.s + hasInterest(messagestr));
    }
    // heap.set(message.s, message)
    if (message.s != null)
      lastHeartbeat = message.s;

    // Hello -> Set Heartbeat Interval
    if (message.op === 10) {
      interval = message.d.heartbeat_interval;
      console.log("[hb] Heartbeat interval set to " + interval + "ms. Starting heartbeat thread: " + (++heartbeatThread))
      setTimeout(() => heartbeat(interval, heartbeatThread), interval * Math.random());
    } else
      // Send Heartbeat ASAP
      if (message.op === 1) {
        console.log("Early heartbeat requested.")
        heartbeat(interval, ++heartbeatThread)
      } else
        // Standard Dipatch
        if (message.op === 0) {
          if (!types.has(message.t))
            types.set(message.t, 0);
          types.set(message.t, types.get(message.t) + 1);

          if (message.t === "READY") {
            sessionID = message.d.session_id;
            self = message.d.user;
            console.log("Connection READY: Logged in as " + self.username + "#" + self.discriminator + " <@" + self.id + "> " + (self.bot ? "[bot]" : "<<selfbot>>") + " -> " + sessionID)
          }

          console.log("Dispatch recieved: " + message.t + " #" + types.get(message.t) + " id=" + message.s + hasInterest(messagestr))
        }
  });
}
term = function() {
  ws.terminate()
}
dc = function() {
  heartbeatThread = -1;
  ws.close(1000)
}



