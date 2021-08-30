const WebSocket = require("ws").WebSocket;
const identify = {"op":2,"d":{"intents":32767,"properties":{"$os":process.platform,"$browser":"node","$device":"firework"},"token":(JSON.parse(require("fs").readFileSync("token.json").toString())).token}};
const heartbeatUpdateInterval = 500;









class Bot {
  constructor() {
    this.ws = null;
    this.lastSequence = null;
    this.lastHeartbeat = 0;
    this.heartbeatShouldBeRunning = false;
    this.types = new Map();
    this.contacts = [];
    this.print = false;
    this.heartbeatThread = 0;
    this.connectionAlive = false;
    this.interval = null;
    this.sessionID = null;
    this.self = null;
  }

  send = function(message) {
    console.log("Sending:")
    console.log(JSON.stringify(message,null,2))
    if (this.connectionAlive)
      this.ws.send(JSON.stringify(message,null));
    else
      console.log("Failed to send. Connection is dead.")
  }

  // Occasionally a double heartbeat gets generated with 2 threads running with the same id or something...
  heartbeat = function() {
    if (!this.connectionAlive) {
      console.log("[hb] Planned heartbeat cancelled. Connection is dead.");
      this.heartbeatShouldBeRunning = false;
      this.lastHeartbeat = 0;
      return;
    }
    if (!this.heartbeatShouldBeRunning) {
      console.log("[hb] Heartbeat should not be running. Stopping heartbeat.");
      this.heartbeatShouldBeRunning = false;
      this.lastHeartbeat = 0;
      return;
    }
    if (Date.now()>=this.lastHeartbeat+this.interval) {
      console.log("[hb] Ba-Bum. Heartbeat sent for message "+this.lastSequence+".");
      this.ws.send(JSON.stringify({"op":1,"d": this.lastSequence},null));
      this.lastHeartbeat = Date.now();
    }
    setTimeout(()=>this.heartbeat(),500);
  }

  hasInterest = function(string) {
    let ret = [];
    if (this.self && string.includes(this.self.id)) ret.push("THIS BOT");
    if (string.includes("163718745888522241")) ret.push("SELKIE");

    if (ret.length==0) return "";
    let retstr = " [";
    for (let i=0; i<ret.length-1; i++)
      retstr+=ret[i]+",";
    return retstr+ret[ret.length-1]+"]"
  }



  online = function() {
    // Update Presence
    this.send({"op":3,"d":{"status":"online","afk":false,"activities":[],"since":null}});
  }
  dnd = function() {
    // Update Presence
    this.send({"op":3,"d":{"status":"dnd","afk":false,"activities":[],"since":null}});
  }
  invis = function() {
    // Update Presence
    this.send({"op":3,"d":{"status":"invisible","afk":false,"activities":[],"since":null}});
  }
  idle = function() {
    // Update Presence
    this.send({"op":3,"d":{"status":"idle","afk":true,"activities":[],"since":null}});
  }
  setStatus = function(string) {
    this.send({"op":3,"d":{"since":91879201,"activities":[{"name":string,"type":3}],"status":"online","afk":false}})
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



  start = function(sid=null, last=null) {
    let thiss = this;
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

    this.ws.on('open', function open() {
      thiss.connectionAlive = true;
      if (sid === null)
        thiss.send(identify)
      else {
        if (last !== null)
          thiss.lastSequence = last;
        thiss.send({"op":6,"d":{"token":identify.d.token,"session_id":sid,"seq":thiss.lastSequence}})
      }
    });

    this.ws.on('close', function close(errcode,buffer,c,d) {
      thiss.connectionAlive = false;
      console.log('disconnected:');
      console.log(errcode);
      console.log('"'+buffer.toString()+'"');
      console.log(c);
      console.log(d);

      if (errcode === 1001 && buffer.toString() === "Discord WebSocket requesting client reconnect.") {
        thiss.start(thiss.sessionID);
      }
    });

    this.ws.on('message', function incoming(message) {
      // console.log('recieved:');
      message = JSON.parse(message);
      let messagestr = JSON.stringify(message,null,2);
      if (thiss.print) console.log(messagestr);

      if (message.s===null || message.t==='RESUMED') {
        console.log("Recieved message (none/heartbeat-ack)");
        console.log(message)
      } else {
        while (thiss.contacts.length<message.s-1)
          thiss.contacts.push(null);
        thiss.contacts[message.s-1] = message;
        // console.log("Recieved message #"+message.s + hasInterest(messagestr));
      }
      // heap.set(message.s, message)
      if (message.s!=null)
        thiss.lastSequence = message.s;

      // Hello -> Set Heartbeat Interval
      if (message.op === 10) {
        thiss.interval = message.d.heartbeat_interval;

        if (thiss.heartbeatShouldBeRunning)
          console.error("[hb] A heartbeat thread already exists, and yet one is about to be started! This should never happen!");

        thiss.heartbeatShouldBeRunning = true;
        // trigger the heartbeat after waiting long enough.
        // Dont set last heartbeat to Date.now()-interval*random;
        // if hb is called now, it would send heartbeat on a multiple of the update interval.
        thiss.lastHeartbeat = 0;
        console.log("[hb] Starting new Heartbeat thread. This should be the only place to do so, outside of manual heartbeat thread restart.")
        setTimeout(()=>thiss.heartbeat(), thiss.interval*Math.random());
      } else
      // Send Heartbeat ASAP
      if (message.op === 1) {
        console.log("[hb] Early heartbeat requested. Should trigger in the next half second.")
        thiss.lastHeartbeat = 0;
      } else
      // Resume Successful
      if (message.op === 7) {
        console.log("Successful reconnection!")
      } else
      // Resume Failed
      if (message.op === 9) {
        console.error("Reconnect failed. Please start a new session.")
        thiss.dc();
      } else
      // Standard Dipatch
      if (message.op === 0) {
        if (!thiss.types.has(message.t))
          thiss.types.set(message.t,0);
        thiss.types.set(message.t,thiss.types.get(message.t)+1);

        if (message.t === "READY") {
          thiss.sessionID = message.d.session_id;
          thiss.self = message.d.user;
          console.log("Connection READY: Logged in as "+thiss.self.username+"#"+thiss.self.discriminator+" <@"+thiss.self.id+"> "+(thiss.self.bot?"[bot]":"<<selfbot>>") + " -> "+thiss.sessionID)
        }

        console.log("Dispatch recieved: "+message.t+" #"+thiss.types.get(message.t) + " id="+message.s + thiss.hasInterest(messagestr))
      }
    });
  }


  g = function(s) {
    console.log(JSON.stringify(this.contacts[s-1],null,2));
  }
  term = function() {
    this.ws.terminate()
    this.heartbeatShouldBeRunning = false;
  }
  dc = function() {
    this.heartbeatShouldBeRunning = false;
    this.ws.close(1000)
  }
  // fix heart beat
  fhb = function() {
    // Mark heartbeat threads to die.
    this.heartbeatShouldBeRunning = false;
    // Wait until two intervals have passed; this should ensure they are dead.
    setTimeout(()=>{
      console.log("[hb] Starting new Heartbeat thread to replace existing ones. There should be only one heartbeat thread running now.");
      this.heartbeat();
    }, 2*heartbeatUpdateInterval);
  }
  // reconnect
  rc = function() {
    if (this.connectionAlive) {
      this.term();
      setTimeout(()=>this.start(this.sessionID), 2*heartbeatUpdateInterval);
    } else
      this.start(this.sessionID);
  }
}


bot = new Bot();


