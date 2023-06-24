var WebSocket = require("ws").WebSocket;
var https = require("https");
var fs = require("fs");
var identify = {"op":2,"d":{"intents":32767,"properties":{"$os":process.platform,"$browser":"node","$device":"firework"},"token":(JSON.parse(fs.readFileSync("gateway_static/token.json").toString())).token}};
var heartbeatUpdateInterval = 500;
var reconnectInterval = 4000;
var userMap = new Map();      // user_id -> user_obj
var activityMap = new Map();  // user_id -> map<timestamp,customStatus/Activity>
var memberMap = new Map();    // guild_id -> map<member_id,members> (contains roles+nick+boost+mute)
var channelMap = new Map();   // channel_id -> channel_obj
var threadMap = new Map();    // thread_id -> thread_obj
var guildNameMap = new Map(); // guild_id -> string
var guildOwnerMap = new Map() // guild_id -> user_id
var rolePositions = new Map();// role_id -> number (used to sort role orders when user leaves)
var userXpMap = new Map();    // guild_id -> map<member_id,xpobj>
                                //         xpobj := {xp:int,lvl:int,lastxptime:time,message_count:int}
var userDmMap = new Map();    // user_id -> channel_id
var sents = [];
var dumpcatch = null;
var beta = false; // sets which set of modules to use (prevents spam when debugging)
var version = "v"(beta?"BETA":"")"0.28."

// privilaged intents codes:
//  w/o       w/
// 32509    32767

// avatars: https://cdn.discordapp.com/avatars/{uid}/{avatar_hash}.png?size=4096


var g_hyec = "336394315041341463"
var g_wofcs = "713127035156955276"
var g_sup = "837532153344294972"
var g_tws = "858140715448139837"

var c_dm = "870868315793391686"
var c_fire = "870500800613470248" // firework-playground

var u_selk = "163718745888522241"
var u_syz = "642971818965073931"
var u_gacek = "488383281935548436"

var r_mod = "724461190897729596"
var r_modling = "739602680653021274"
var r_botwing = "713510512150839347"

var SNOWFLAKE_ONE_MONTH = "11234023833600000" // 17 digits starts with 11
              //  oldest: "49230618424246272" // 17 digits starts with 49
              //     me: "163718745888522241" // 18 digits starts with 16
              //  2022: "1000000000000000000" // 19 digits


var dispatchTypes = [  // GUILDS (1 << 0)
  "GUILD_CREATE", "GUILD_UPDATE", "GUILD_DELETE", "GUILD_ROLE_CREATE", "GUILD_ROLE_UPDATE", "GUILD_ROLE_DELETE",
  "CHANNEL_CREATE", "CHANNEL_UPDATE", "CHANNEL_DELETE", "CHANNEL_PINS_UPDATE", "THREAD_CREATE", "THREAD_UPDATE",
  "THREAD_DELETE", "THREAD_LIST_SYNC", "THREAD_MEMBER_UPDATE", "THREAD_MEMBERS_UPDATE"/* * */, "STAGE_INSTANCE_CREATE",
  "STAGE_INSTANCE_UPDATE", "STAGE_INSTANCE_DELETE", 
  // GUILD_MEMBERS (1 << 1)
  "GUILD_MEMBER_ADD", "GUILD_MEMBER_UPDATE", "GUILD_MEMBER_REMOVE", "THREAD_MEMBERS_UPDATE"/* * */,
  // GUILD_BANS (1 << 2)
  "GUILD_BAN_ADD", "GUILD_BAN_REMOVE",
  // GUILD_EMOJIS_AND_STICKERS (1 << 3)
  "GUILD_EMOJIS_UPDATE", "GUILD_STICKERS_UPDATE",
  // GUILD_INTEGRATIONS (1 << 4)
  "GUILD_INTEGRATIONS_UPDATE", "INTEGRATION_CREATE", "INTEGRATION_UPDATE", "INTEGRATION_DELETE",
  // GUILD_WEBHOOKS (1 << 5)
  "WEBHOOKS_UPDATE",
  // GUILD_INVITES (1 << 6)
  "INVITE_CREATE", "INVITE_DELETE",
  // GUILD_VOICE_STATES (1 << 7)
  "VOICE_STATE_UPDATE",
  // GUILD_PRESENCES (1 << 8)
  "PRESENCE_UPDATE",
  // GUILD_MESSAGES (1 << 9)
  "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "MESSAGE_DELETE_BULK",
  // GUILD_MESSAGE_REACTIONS (1 << 10)
  "MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL", "MESSAGE_REACTION_REMOVE_EMOJI",
  // GUILD_MESSAGE_TYPING (1 << 11)
  "TYPING_START",
  // DIRECT_MESSAGES (1 << 12)
  "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "CHANNEL_PINS_UPDATE",
  // DIRECT_MESSAGE_REACTIONS (1 << 13)
  "MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE", "MESSAGE_REACTION_REMOVE_ALL", "MESSAGE_REACTION_REMOVE_EMOJI",
  // DIRECT_MESSAGE_TYPING (1 << 14)
  "TYPING_START",
  // GUILD_SCHEDULED_EVENTS (1 << 16)
  "GUILD_SCHEDULED_EVENT_CREATE", "GUILD_SCHEDULED_EVENT_UPDATE", "GUILD_SCHEDULED_EVENT_DELETE",
  "GUILD_SCHEDULED_EVENT_USER_ADD", "GUILD_SCHEDULED_EVENT_USER_REMOVE"
]

// Guild Tags: CLYDE_EXPERIMENT_ENABLED COMMUNITY SUMMARIES_ENABLED_GA SUMMARIES_ENABLED SHARED_CANVAS_FRIENDS_AND_FAMILY_TEST PARTNERED INTERNAL_EMPLOYEE_ONLY


if (!console.isChangedBySelkie) {
  const oldlog = console.log;
  console.log=(a,b,c,d)=>{
    if (d!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b,c,d);
    else if (c!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b,c);
    else if (b!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b);
    else oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a);}
  const olderr = console.error;
  console.error=(a,b,c,d)=>{
    if (d!==undefined) olderr("ERR["+new Date().toISOString().substring(11,19)+"]",a,b,c,d);
    else if (d!==undefined) olderr("ERR["+new Date().toISOString().substring(11,19)+"]",a,b,c);
    else if (d!==undefined) olderr("ERR["+new Date().toISOString().substring(11,19)+"]",a,b);
    else olderr("ERR["+new Date().toISOString().substring(11,19)+"]",a);}
  console.isChangedBySelkie = true;
}


var config = null;
load = function(path = "gateway_data") {
  // Typically Unchanging
  config = JSON.parse(fs.readFileSync(path+"/config.json"));
  config.threadAlive = new Set(config.threadAlive);
  console.log("Config loaded.")

  // Load data that typically changes
  if (fs.existsSync(path+"/threadMap.json")) {
    let data = JSON.parse(fs.readFileSync(path+"/threadMap.json"));
    Object.entries(data).forEach(a=>threadMap.set(a[0],a[1]));
    console.log("Thread Map loaded.")
  } else console.error("Data threadMap JSON doesnt exist! Cannot read the Data That Typically Changes!");

  if (fs.existsSync(path+"/userXpMap.json")) {
    let data = JSON.parse(fs.readFileSync(path+"/userXpMap.json"));
    userXpMap.clear();
    Object.entries(data).forEach(a=>userXpMap.set(a[0],new Map(Object.entries(a[1]))));
    console.log("XP Map loaded.")
  } else console.error("Data userXpMap JSON doesnt exist! Cannot read the Data That Typically Changes!");

  if (fs.existsSync(path+"/userDmMap.json")) {
    let data = JSON.parse(fs.readFileSync(path+"/userDmMap.json"));
    userDmMap.clear();
    Object.entries(data).forEach(a=>userDmMap.set(a[0],a[1]));
    console.log("DM Map loaded.")
  } else console.error("Data userDmMap JSON doesnt exist! Cannot read the Data That Typically Changes!");
}
save = function(path = "gateway_data") {
    // Typically Unchanging
  try {
    config.threadAlive = [...config.threadAlive].sort();
    fs.writeFileSync(path+"/config.json", JSON.stringify(config,null,2));
    config.threadAlive = new Set(config.threadAlive);
    console.log("Config saved.");
  } catch (e) {console.error(e)}

    // Data that typically changes
  try {
    fs.writeFileSync(path+"/threadMap.json",JSON.stringify((
        Object.fromEntries([...threadMap.entries()].sort()) // sort by thread id oldest to newest
      ),null,2));
    console.log("Thread Map saved.");
  } catch (e) {console.error(e)}
  try {
    fs.writeFileSync(path+"/userXpMap.json",JSON.stringify((
        Object.fromEntries([...userXpMap.entries()].map(a=>[a[0],Object.fromEntries(a[1])]))
      ),null,2));
    console.log("XP Map saved.");
  } catch (e) {console.error(e)}
  try {
    fs.writeFileSync(path+"/userDmMap.json",JSON.stringify((
        Object.fromEntries([...userDmMap.entries()].sort((a,b)=>Number(a)-Number(b)))
      ),null,2))
    console.log("DM Map saved.");
  } catch (e) {console.error(e)}
}


// Discord requests queued to update various caches without breaking ratelimit.
var cq = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  priorities: ["HIGH","MEDIUM","LOW"],
  lastSent: 0, // in millis
  maxRate: 500, // in ms
  add: (priority, func) => cq.queue.get(priority).push(func),
  pop: () => cq.priorities.map(a=>cq.queue.get(a)).find(a=>a.length>0)?.shift(),
  attempt: () => cq.lastSent+cq.maxRate<=new Date()?cq.pop()?.(cq.lastSent=+new Date()):undefined
};
  cq.queue = new Map(cq.priorities.map(a=>[a,[]]));

if (!console.boxClassCreated) {
class Bot {
  constructor() {
    this.ws = null;
    this.lastSequence = null;
    this.lastHeartbeat = 0;
    this.heartbeatShouldBeRunning = false;
    this.types = new Map(); // dispatch_type -> count
    this.contacts = [];  // TODO: Crashes on outputting more than 500mb. Split into 100k segments on output?
    // var sents = []; // global cuz refactoring is pain
    this.print = false; // print all dispatch to logs
    // this.send = true; // false to disable sending messages via sendMessage method
    // this.heartbeatThread = 0;
    this.connectionAlive = false;
    this.interval = null;
    this.sessionID = null;
    this.self = null; // the user object for this bot.
    this.modules = []; // Normal modules to run
    this.modulesPre = []; // Modules to run before the others; updates the states of things.
    this.modulesPost = []; // Modules to run after the others; clears the states of things.
    this.plannedMessages = []; // heap of messages to be sent; tags of when to send and if late messages okay.
    this.timeStart = Date.now();
    this.timeLastReconnect = null;
    // If true, do not send messages.
    this.silent = false;

    try {
      let data = fs.readFileSync("gateway_data/firework_config.json").toString();
      data = JSON.parse(data);
      this.config = data;
    } catch (err) {}
    try {
      let data = fs.readFileSync("gateway_data/firework_plannedactions.json").toString();
      data = JSON.parse(data);
      this.plannedMessages = data;
    } catch (err) {}
  }

  wsSend = function(webhookPacket) {
    console.log("Sending:")
    console.log(JSON.stringify(webhookPacket,null,2))
    if (this.connectionAlive)
      this.ws.send(JSON.stringify(webhookPacket,null));
    else
      console.log("Failed to send. Connection is dead.")
  }

  heartbeatForce = function() {
    this.lastHeartbeat = 0;
    this.heartbeat();

    let wasRunning = this.heartbeatShouldBeRunning;

    this.heartbeatShouldBeRunning = false;
    setTimeout(()=>{
      this.heartbeatShouldBeRunning = wasRunning;
      this.heartbeat()
    },1000);
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
      this.ws.send(JSON.stringify({"op":1,"d": this.lastSequence}));
      this.lastHeartbeat = Date.now();
    }
    setTimeout(()=>this.heartbeat(),500);
    try{cq.attempt()}catch{}

    // save data on occasion
    try{
      if (this.contacts.length%100000 == 0 && this.contacts.length>0) {

        sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],
            "Saving contacts #"+(this.contacts.length/100000)+"..."
          );
        this.heartbeatForce();
        this.cleanup();
        sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],
            "Contacts saved."
          );
      }
    }catch (e) {
      sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],
          "Try-Catch catch ran in scheduled save. Crash prevented, and error stored in global variable `dumpcatch`..."
        );
      dumpcatch = e;
    }
  }

  hasInterest = function(string) {
    let ret = [];
    if (this.self && string.includes(this.self.id)) ret.push("FIREWORK");
    if (string.includes("163718745888522241")) ret.push("SELKIE");

    if (ret.length==0) return "";
    let retstr = " [";
    for (let i=0; i<ret.length-1; i++)
      retstr+=ret[i]+",";
    return retstr+ret[ret.length-1]+"]"
  }



  online = function() {
    // Update Presence
    this.wsSend({"op":3,"d":{"status":"online","afk":false,"activities":[],"since":null}});
  }
  dnd = function() {
    // Update Presence
    this.wsSend({"op":3,"d":{"status":"dnd","afk":false,"activities":[],"since":null}});
  }
  invis = function() {
    // Update Presence
    this.wsSend({"op":3,"d":{"status":"invisible","afk":false,"activities":[],"since":null}});
  }
  idle = function() {
    // Update Presence
    this.wsSend({"op":3,"d":{"status":"idle","afk":true,"activities":[],"since":null}});
  }
  // "Ice Selkie ✿#4064 code the Firework Bot!"
  setStatus = function(string) {
    this.wsSend({"op":3,"d":{"since":91879201,"activities":[{"name":string,"type":3}],"status":"online","afk":false}});
  }




  addModule = function(module) {
    this.modules.push(module);
  }
  start = function(sid=null, last=null) {
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');
    if (sid!=null) this.timeLastReconnect = Date.now();

    this.ws.on('open', () => this.wsOnOpen(this, sid, last));
    this.ws.on('close', (errcode, buffer) => this.wsOnClose(this, errcode, buffer));
    this.ws.on('message', (message) => this.wsOnMessage(this, message));
  }
  wsOnOpen = function(thiss, sid, last) {
    thiss.connectionAlive = true;
    if (sid === null)
      thiss.wsSend(identify)
    else {
      if (last !== null)
        thiss.lastSequence = last;
      thiss.wsSend({"op":6,"d":{"token":identify.d.token,"session_id":sid,"seq":thiss.lastSequence}})
    }
    // ["870500800613470248","870868727820849183","883172908418084954"]
    //   WOFCS embed playgr   twstjm firw testin   hyec firework logs
    if (sid)
      sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],"Firework bot is reconnecting.");
    else
      sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],"Firework bot has connected.");
  }

  wsOnClose = function(thiss, errcode, buffer) {
    thiss.connectionAlive = false;
    console.log('disconnected:');
    console.log(errcode);
    console.log('"'+buffer.toString()+'"');

    sendMessage([/*"870500800613470248","870868727820849183",*/"883172908418084954"],
      "Firework bot has lost connection: "+errcode+"\n> '"+buffer.toString()+"'");

    if (errcode === 1001) {
      if (buffer.toString() === "Discord WebSocket requesting client reconnect.")
        console.log("Discord server load balancing... Reconnecting...");
      else if (buffer.toString() === "CloudFlare WebSocket proxy restarting")
        console.log("CloudFlare proxy load balancing... Reconnecting...");
      else
        console.log("Unknown 1001... Reconnecting...");
      thiss.start(thiss.sessionID);
    }
    if (errcode === 1006) {
      console.log("Unexpected client side disconnect... Reconnecting in 4 seconds...");
      setTimeout(()=>thiss.start(thiss.sessionID), reconnectInterval);
    }
  }
  wsOnMessage = function(thiss, message) {
    let message_time = Date.now();
    // console.log('received:');
    message = JSON.parse(message);
    message.time = message_time;
    let messagestr = JSON.stringify(message,null,2);
    if (thiss.print) console.log(messagestr);

    if (message.s===null || message.t==='RESUMED') {
      console.log("Received message (none/heartbeat-ack)");
      console.log(message)
    }
    if (message.s!=null) {
      while (thiss.contacts.length<message.s-1)
        thiss.contacts.push(null);
      thiss.contacts[message.s-1] = message;
      // console.log("Received message #"+message.s + hasInterest(messagestr));
      thiss.lastSequence = message.s;
    }

    // Hello -> Set Heartbeat Interval
    if (message.op === 10) {
      console.log("Received message (none/hello)");
      console.log(message)

      thiss.interval = message.d.heartbeat_interval;

      if (thiss.heartbeatShouldBeRunning)
        console.error("[hb] A heartbeat thread already exists, and yet one is about to be started! This should never happen!");

      thiss.heartbeatShouldBeRunning = true;
      // trigger the heartbeat after waiting long enough.
      // Dont set last heartbeat to Date.now()-interval*random;
      // if hb is called now, it would send heartbeat on a multiple of the update interval.
      thiss.lastHeartbeat = 0;
      console.log("[hb] Starting new Heartbeat thread. This should be the only place to do so, outside of manual heartbeat thread restart.")
      // First heartbeat should run after a jitter:
      thiss.lastHeartbeat = 2*new Date() // Dont run yet
      thiss.heartbeat() // Start heartbeat thread
      // set to "run now" after jitter has passed.
      setTimeout(()=>thiss.lastHeartbeat=0, thiss.interval*Math.random());
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
      sendMessage(["870500800613470248","870868727820849183","883172908418084954"],
        "Reconnect failed with op code 9. Will **_not_** attempt to reconnect. Bot has effectively died; Manual restart required.\n\n> "+version+"\n\n<@163718745888522241>");
      thiss.dc();
      setTimeout(()=>thiss.cleanup(),5000);
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

      console.log("Dispatch received: "+message.t+" #"+thiss.types.get(message.t) + " id="+message.s + thiss.hasInterest(messagestr))


      thiss.modulesPre.forEach(a => thiss.runModule(thiss,a,message));
      thiss.modules.forEach(a => thiss.runModule(thiss,a,message));
      thiss.modulesPost.forEach(a => thiss.runModule(thiss,a,message));
    }
  }

  runModule = function(thiss, currentModule, message) {
    try {
      if (currentModule.onDispatch) currentModule.onDispatch(thiss, message);
    } catch (err) {
      console.error(err);
      sendMessage("883172908418084954",err.toString())
    }
  }

  cleanup = function() {
    oldlog(timeDuration(this.timeStart,this.contacts[this.contacts.length-1].time));
    oldlog(new Date(this.contacts[this.contacts.length-1].time));
    oldlog(this.contacts.length/1000);
    save()
    oldlog(version);

    let division_size = 500e3;
    let strlen = (this.contacts.length).toString().length;
    fs.writeFileSync("contacts"+(beta?"beta/":"/")+this.contacts[0].time+"-"+this.contacts.length+"-sents.json",JSON.stringify(sents));
    if (this.contacts.length <= division_size) 
      fs.writeFileSync("contacts"+(beta?"beta/":"/")+this.contacts[0].time+"-"+this.contacts.length+".json",JSON.stringify(this.contacts));
    else {
      for (let i=0; i<this.contacts.length; i+=division_size) {
        fs.writeFileSync(
            "contacts"+(beta?"beta/":"/")+this.contacts[0].time+"-"+this.contacts.length
              +"-part"+((i).toString().padStart(strlen,"0"))+".json",
            JSON.stringify(this.contacts.slice(i,i+division_size)));
      }
    }
    oldlog("Saving logs done.");
  }


  term = function() {
    // this.ws.terminate()
    this.ws.close(4321)
    this.heartbeatShouldBeRunning = false;
  }
  dc = function() {
    this.heartbeatShouldBeRunning = false;
    this.ws.close(1000)
    setTimeout(()=>this.cleanup(),5000);
  }
  // reconnect
  rc = function() {
    if (this.connectionAlive) {
      this.term();
      setTimeout(()=>this.start(this.sessionID), 2*heartbeatUpdateInterval);
    } else
      this.start(this.sessionID);
  }
  // // reconnect elsewhere. Loses a lot of history. Not recommended.
  // rcc = function() {
  //   this.term();

  //   setTimeout(()=>{
  //     console.log("// -------- //");
  //     console.log("// To reconnect from a new node instance, past in these commands with the same bot token.");
  //     console.log(".load gateway.js");
  //     console.log("bot.start('"+this.sessionID+"', "+this.lastSequence+")");
  //     console.log("// -------- //");
  //   }, 4*heartbeatUpdateInterval);
  // }
}
go = function() {
  bot.start();
  setTimeout(()=>{bot.setStatus("Ice Selkie ✿#4064 code the Firework Bot!");}, 2000);
}
console.boxClassCreated = true;
bot = new Bot();
}











// const WebSocket = require("ws").WebSocket;
// const https = require("https");
// const fs = require("fs");
// const identify = {"op":2,"d":{"intents":32767,"properties":{"$os":process.platform,"$browser":"node","$device":"firework"},"token":(JSON.parse(fs.readFileSync("gateway_static/token.json").toString())).token}};
// const heartbeatUpdateInterval = 500;


var multipartboundary = "boundary" + (Buffer.from("("+ +new Date()+")",'utf-8').toString("base64"))
function discordRequest(path, data=null, method=null, attachments=null, isText=true, useToken=true) {
  if (path == undefined) {
    return 'function discordRequest(path, data=null, method=null="GET", attachments=null, isText=true, useToken=true)\n'+
    'path="channels/####" or "https://discord.com/api/v9/channels/####"\n'+
    'data={json:"payload",or:"object to cast to json"}\n'+
    'method="null/GET/POST/PUT/DELETE/etc"\n'+
    'attachments="../firework_pfp.png"\n'+
    '    or {filename?:"unknown.txt",mime?:"text/plain",path:"/path/to/file"}\n'+
    '    or {filename?:"pfp.png",mime?:"image/png",data:<raw-data>}\n'+
    '    or array of above (up to 10)\n'+
    'isText=true -> utf8 text -> returned.res will be string\n'+
    '    otherwise, isText=false -> returned.res will be Buffer of raw bytes\n'+
    'useToken=true -> uses authorization header or not in request. Discord API needs. Everywhere else will leak bot token.\n'+
    '\n'+
    'var multipartboundary = '+JSON.stringify(multipartboundary)+' for "multipart/form-data" boundaries.\n'+
    '    If "--boundary" will occur in payload, change this var.';
  }
  // console.log("Discord Request called with path of:")
  // console.log(path)
  // console.log("Discord Request called with data of:")
  // console.log(data)
  return new Promise((resolve,reject)=>{
    let hasPayload = data!=null;
    let multipart = attachments!=null;

    if (useToken === null)
      useToken = true;
    if (isText === null)
      isText = true;
    if (method == null && (hasPayload||multipart))
      method = "POST";
    if (method == null)
      method = "GET";
    if (attachments && !(attachments instanceof Array))
      attachments = [attachments]
    if (attachments && attachments.length>=10)
      throw 'At most 10 attachments per message.'
    if (path.startsWith('https://')){
      host = path.substring(8) // "https://discord.com/api..." -> "discord.com/api..."
      host = host.substring(0,host.indexOf('/')) // "discord.com/api..." -> "discord.com"
      if (!host.includes("discord") || !host.includes("api"))
        useToken = false;
    } else
      host = "discord.com"

    let headers = {"content-type":"application/json"};
    if (useToken)
      headers.authorization=identify.d.token;
    if (multipart)
      headers["content-type"] = 'multipart/form-data;boundary="'+multipartboundary+'"';

    let opts = {"hostname": host,"port": 443,"headers":headers,
      "path": (path.startsWith("https://")?path:"/api/v9/"+path),
      "method": method
    }
    if (typeof data !== "string")
      data = JSON.stringify(data);

    let multipartdata = []
    if (multipart) {
      multipart = "";
      if (data) {
        multipart += '--'+multipartboundary+'\n'
        multipart += 'Content-Disposition: form-data; name="payload_json"\n';
        multipart += 'Content-Type: application/json\n';
        multipart += '\n';
        multipartdata.push(multipart);
        multipartdata.push(data);
        multipart  = '\n';
        data = null;
      }
      attachments.forEach((att,i)=> {
        // att can be file name -> get file and upload it
        //   "/path/to/file"
        // or raw data -> upload the data
        //   {filename:"file.txt",mime:"text/plain",data:<raw-data>||file:"/path/to/file"}
        // URL to reupload not accepted, since that would require this to be async.
        if (typeof att === "string") {
            att = {file:att}
        }
        if ((!!att.data) + (!!att.file) != 1)
          throw 'Attachment expected one of: rawdata (attachment.data) or filepath (attachment.file). Received neither or both.'
        if (att.file && !fs.existsSync(att.file))
          throw 'Attachment expected to find a file, but instead '+JSON.stringify(att.file)+' didnt exist.';
        let buffer;
        if (att.file) {
          if (!att.filename)
            att.filename = att.file.substring(att.file.lastIndexOf('/')+1);
          if (!att.mime)
            att.mime = mimelookup(att.file.substring(att.file.lastIndexOf('.')+1));
          buffer = fs.readFileSync(att.file);
        }
        if (att.data) {
          if (!att.filename)
            att.filename = "unknown"
          if (!att.mime)
            att.mime = "text/plain"
          buffer = att.data
          if (buffer.data && buffer.type === "Buffer")
            buffer = Buffer.from(buffer)
        }
        // if (att.url) {
        //   if (!att.filename) {
        //     att.filename = att.url;
        //     if (att.filename.includes('?'))
        //       att.filename = att.filename.substring(0,att.filename.indexOf('?'));
        //     if (att.filename.includes('#'))
        //       att.filename = att.filename.substring(0,att.filename.indexOf('#'));
        //     att.filename = att.filename.substring(att.filename.lastIndexOf('/')+1);
        //   }
        //   if (!att.mime)
        //     att.mime = mimelookup(att.file.substring(att.file.lastIndexOf('.')+1));
        //   buffer = await discordRequest(att.url).res
        // }

        multipart += '--'+multipartboundary+'\n'
        multipart += 'Content-Disposition: form-data; name="files['+i+']"; filename="'+att.filename+'"\n'
        multipart += 'Content-Type: '+att.mime+'\n';
        multipart += '\n';
        multipartdata.push(multipart);
        multipartdata.push(buffer);
        multipart  = '\n';
      });

      multipart += '--'+multipartboundary+'--\n';

      multipartdata.push(multipart);
      multipart = true;
    }
    
    let saveObject = {
      method:opts.method,
      path:opts.path,
      timeSend:Date.now()
    };
    if (data) saveObject.data = data;
    if (multipart) saveObject.multipart = true;
    sents.push(saveObject);
    console.log(JSON.stringify(saveObject));
    // fs.appendFileSync("contacts"+(beta?"beta/":"/")+"latest.log",JSON.stringify(saveObject)+"\n")

    let req = https.request(opts,
      res=>{
        let data;
        if (isText)
          data = '';
        else
          data = []

        if (isText)
        res.setEncoding('utf8');
        // console.log('Headers:\n'+JSON.stringify(res.headers,null,2));
        res.on('data',part=>{
          if (isText)
            data+=part;
          else
            data.push(part)
        });
        // TODO: remember ratelimit data
        res.on('end',()=>{
          if (!isText)
            data = Buffer.concat(data)
          saveObject.timeDone = Date.now();
          saveObject.ret = res.statusCode;
          saveObject.res = data;
          saveObject.ratelimit_data = JSON.stringify(res.headers,null,2);
          fs.appendFileSync("contacts"+(beta?"beta/":"/")+"latest.log",JSON.stringify(saveObject)+"\n")
          // Notify if something goes wrong
          if (res.statusCode>=400 && !path.includes("883172908418084954")) { // prevent spam on retrying send message failures.
            let msg = data;
            if (!isText) msg = ""+msg
            sendMessage("883172908418084954", {"embeds":[{
                "author":{"name":method+" Failed"},
                "title":"http error "+res.statusCode,
                "description":msg.substring(0,4001),
                "footer":{"text":path},
                "timestamp":new Date().toISOString()}]});
          }
          resolve(saveObject);
        });
      }).on('error',err=>{
        saveObject.timeDone = Date.now();
        saveObject.err = err;
        fs.appendFileSync("contacts"+(beta?"beta/":"/")+"latest.log",JSON.stringify(saveObject)+"\n")
        console.error(err);
        if (!path.includes("883172908418084954")) // prevent spam on retrying send message failures.
          sendMessage("883172908418084954",err.toString().substring(0,4000))
        reject(err);
      });
    if (data !== null) {
      req.write(data);
    } else {
      multipartdata.forEach(data => req.write(data))
    }
    req.end();
  });
}
async function sendMessage(channel_id, message_object) {
  // TODO:
  //   - check ratelimit
  //   - if ratelimit hit; wait and try again.
  //   - message send queue, bucketed by channel
  if (typeof message_object === "string")
    message_object = {"content":message_object};
  if (channel_id == null)
    return "channel_id was null or undefined.";
  let type = typeof channel_id;
  if (type !== 'string' && type !== 'bigint' && type !== 'number') {
    let ret = [];
    for (let i=0; i<channel_id.length; i++) {
      let temp = await sendMessage(channel_id[i],message_object);
      ret.push(temp);
    }
    return ret;
  }
  else {
    if (!bot.silent)
      return discordRequest("channels/"+channel_id+"/messages",JSON.stringify(message_object));
    return new Promise((resolve,reject)=>resolve({res:null,ret:"silent"}));
  }
}

replyToMessage = async function(original, message_object) {
  if (typeof message_object === "string")
    message_object = {"content":message_object};
  message_object.message_reference = {channel_id:original.channel_id, message_id:original.id};
  return sendMessage(original.channel_id,message_object);
}

var mimetypes = new Map(JSON.parse(fs.readFileSync('gateway_static/mimetypes.json')))
function mimelookup(ext) {
  if (mimetypes.has(ext))
    return mimetypes.get(ext);
  if (mimetypes.has("."+ext))
    return mimetypes.get("."+ext);

  // Arbitrary Binary. The default.
  return 'application/octet-stream'
  // Text only. No binary.
  return 'text/plain'
}

/**
 * Discord CDN uri -> buffer
 */
function downloadFile(uri) {
  return new Promise((resolve,reject)=>{
    discordRequest(uri,null,"GET",null,false,false).then(a=>resolve(a.res),e=>reject(e))
  })

  // /**
  //  * Downloads a file from a discord cdn, returning the path to the file as a string.
  //  * Buckets specify where to retain the files. Null or undefined implies temp file.
  //  * Files in the temp folder will be cleared on occasion, after some time has passed.
  //  * Buckets only allow alphanumeric, dash, underscore, and / for subfolders.
  //  * 
  //  * eg downloadFile("url/to/avatar.png", "avatars", "163718745888522241_3bb5bfa826fa59167533f6380127d59e.png")
  //  */
  // // If already downloaded, return that path
  // bucket = "./"+(("/"+(bucket||"temp")+"/").replaceAll(/[^-/_a-zA-Z0-9]/g,"").replaceAll(/\/+/g,"/").toLowerCase().substring(1)||"temp/")
  // fs.mkdirSync(bucket, { recursive: true })
  // // if (fs.existsSync(bucket+hash(uri)))
  // //   return hash(uri)

  // // Else, ensure destination exists

  // // download it
  // // return the path to it
  // return;
}
function downloadFiles(uris) {
  return new Promise((resolve,reject)=>{
    let ret = uris.map(a=>undefined);
    uris.forEach((uri,i)=>downloadFile(uri).then(dat=>{
      ret[i]=dat;
      if (ret.filter(a=>!a).length===0)
        resolve(ret);
    }));
    if (uris.length==0)
      resolve(ret)
  })
}





var parseCommandRegex = null
function parseCommandToArgs(input) {
  if (!parseCommandRegex) {
    let stringGrouping = '"[^"\\\\]*(?:\\\\[\\S\\s][^"\\\\]*)*"'

    let allStrings = 
      "(?:"+ // NCG Open ━━━━━━━━━━━━━━━━━━━━━━━━┓
        ([                                    // ┃
          stringGrouping,                     // ┃
          stringGrouping.replaceAll('"',"'"), // ┃
          stringGrouping.replaceAll('"','`')  // ┃
        ].join('|'))+                         // ┃
      ")" // NCG Close ━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    let weirdThingIdk = '(?:\\/[^\\/\\\\]*(?:\\\\[\\S\\s][^\\/\\\\]*)*\\/[gimy]*(?=\\s|$))'

    // Note: CG = capturing group; NCG = non-caputuring group
    let regex = 
      '('+      //  CG 1 Open ━━━━━━━━━━━━━━━━━━━━━┓
        '(?:'+  // NCG 2 Open ━━━━━━━━━━━━━━━━━━━┓ ┃
          allStrings+ // ══════════════════════╡ ┃ ┃
          '|'+ // or                             ┃ ┃
//        weirdThingIdk+ // ═══════════════════╡ ┃ ┃
//        '|'+ // or                             ┃ ┃
          '(?:'+ // NCG 3 Open ━━━━━━━━━━━━━━━━┓ ┃ ┃
            '\\\\\\\\'+ // escaped backslash   ┃ ┃ ┃ // wait shouldnt escaped any
            '|'+ // or                         ┃ ┃ ┃ // include escaped backslash?
            '\\\\[\\s\\S]'+ // escaped any     ┃ ┃ ┃
            '|'+ // or                         ┃ ┃ ┃
            '[^\\s\\\\]'+ // anything else     ┃ ┃ ┃
          ')'+  // NCG 3 Close ━━━━━━━━━━━━━━━━┛ ┃ ┃
        ')'+  // NCG 2 Close ━━━━━━━━━━━━━━━━━━━━┛ ┃
        '+'+  // NCG 2 Repeat 1 or more            ┃
      ')'+  // CG 1 Close ━━━━━━━━━━━━━━━━━━━━━━━━━┛
      '(?=\\s|$)'; // Lookahead to ensure whitespace/end follows

    console.log(regex)
    // convert to a regex object
    parseCommandRegex = RegExp(regex,"g");
  }
  return [...input.matchAll(parseCommandRegex)].map(a=>a[0])
}

function commandAndPrefix(content) {
  let argv = parseCommandToArgs(content)
  if (/<@!?870750872504786944>/.test(argv.shift())) {
    return argv;
  }
  return false;
}


function isStaff(uid, gid) {
  if (uid === "163718745888522241")
    return true;
  if (!gid) // dm
    return false;
  let member = memberMap.get(gid).get(uid);
  return (member && (member.roles.includes(r_mod) || member.roles.includes(r_modling)))
}

function isDev(uid) {
  if (uid === "163718745888522241" || uid === "488383281935548436")
    return true;
}

/**
 * timeDuration
 * Takes in a duration or a start time and end time in milliseconds, and finds
 * the duration between them, outputting it in a human readable format.
 * 
 * - Correctly pluralizes time units
 * - If two or more time unit terms, joins the last two with "and"
 * - negative duration puts "negative" in front
 * - If one zero term between two non-zeros, will display.
 * - If two or more concecutive zeros, don't display them.
 * - no commas.
 */
function timeDuration (start, end) {
  if (start==null)
    return null;

  let duration = start;
  if (end!=null)
    duration = end-start;

  if (duration==0)
    return "0.000 seconds";
  let isNeg = duration<0;
  if (isNeg)
    duration = -duration;

  let ms = duration%1000;
  duration = Math.floor(duration/1000);
  let sec = duration%60;
  duration = Math.floor(duration/60);
  let min = duration%60;
  duration = Math.floor(duration/60);
  let hr = duration%24;
  duration = Math.floor(duration/24);
  let day = duration%365;
  duration = Math.floor(duration/365);
  let year = duration;

  let ret2 = [[]];

  if (year!==0)
    ret2.push([year+(year===1?" year":" years")]);
  if (day!==0 || (year!==0 && hr!==0))
    ret2.push([day+(day===1?" day":" days")]);
  if (hr!==0 || (day!==0 && min!==0))
    ret2.push([hr+(hr===1?" hour":" hours")]);
  if (min!==0 || (hr!==0 && sec!==0))
    ret2.push([min+(min===1?" minute":" minutes")]);
  if (year===0 && day===0 && hr===0 && min===0)
    if (sec!==0)
      ret2.push([sec+"."+ms+(sec===1 && ms===0?" second":" seconds")]);
    else // ms is always non-zero
      ret2.push([ms+(ms===1?" millisecond":" milliseconds")]);
  else
    if (sec!==0 || (min!==0))
      ret2.push([sec+(sec===1?" second":" seconds")]);

  if (isNeg)
    ret2[0].push("negative");
  if (ret2.length>=3) // negative (or empty array) is always 0th
    ret2[ret2.length-2].push("and");
  return ret2.flat().join(" ");
}

function snowflakeToTime(snowflake) {
  return snowflake?Number(BigInt(snowflake)/4194304n+1420070400000n):snowflake;
}

function timeToSnowflake(time) {
  return String((BigInt(time)-1420070400000n)*4194304n);
}

function stringToSnowflake(str) {
  // Try for snowflake, ping, silent ping, channel, role, emote, manual cmutg, or time.
  let regexForTime = /\<t:[0-9]+(?:\:[fFdDtTR])?\>/
  let regex = /^([0-9]+)$|\<(?:\@|\@\!|\#|\@\&|\:[a-zA-Z\-_~0-9]*\:|[cmutg])([0-9]+)\>/
  let match = str?.match(regex);
  if (match == null)
    return null;

  match = match.splice(1,2).find(a=>a);

  // If none of those are found, try to interpret the whole thing as a number
  if (snowflakeToTime(match)<snowflakeToTime(SNOWFLAKE_ONE_MONTH) || snowflakeToTime(match) > +new Date())
    return null;
  return match;
}

function userLookup(uid,gid) {
  try {
    // TODO: am using userMap before user is put into it.
    let username = userMap.get(uid).username + "#" + userMap.get(uid).discriminator
    let nick = undefined
    if (memberMap.has(gid)) {
      let guildMap = memberMap.get(gid)
      if (guildMap.has(uid)) {
        let member = guildMap.get(uid)
        if (member.nick)
          nick = member.nick
      }
    }
    if (nick)
      return '`'+nick+'` (`'+username+'` <@'+uid+'> '+uid+')'
    return '`'+username+'` (<@'+uid+'> '+uid+')'
  } catch (e) {console.error(e)}
  return 'User Not Found (<@'+uid+'> '+uid+')'
}
function guildLookup(gid) {
  try {
    if (guildNameMap.has(gid))
      return '`'+guildNameMap.get(gid)+'` ('+gid+')'
  } catch (e) {console.error(e)}
  return 'Guild Not Found ('+gid+')'
}
function channelLookup(cid) {
  try {
    if (channelMap.has(cid))
      return '`#'+channelMap.get(cid).name+'` (<#'+cid+'> '+cid+')'
  } catch (e) {console.error(e)}
  return 'Channel Not Found (<#'+cid+'> '+cid+')'
}
function findMessage(mid) {
  let ret = []
  bot.contacts.forEach(a=>{if(a.t==="MESSAGE_CREATE" && a.d.id === mid) ret.push(a)})
  return ret
}












modules = {
  nop: null,
  securityIssue: null,
  userMemoryPre: null,
  userMemoryPost: null,
  joinMessages: null,
  inviteLogging: null,
  disboardReminder: null,
  threadLogging: null,
  infoHelpUptime: null,
  embeds: null,
  threadAlive: null,
  xp: null,
  saveLoad: null,
  whois: null,
  whatis: null,
  boosters: null,
  listModules: null,
  webhookWatch: null
}

modules.nop = {
  name: "nop",
  onDispatch: (bot,msg)=>{}
}
modules.securityIssue = {
  name: "securityIssue",
  onDispatch: (bot,msg) => {
    if (msg.t === "MESSAGE_CREATE" && msg.d.author.id === "163718745888522241"){
      try {
        if (/^<@870750872504786944> execute /.test(msg.d.content))
          replyToMessage(msg.d,""+eval(msg.d.content.substring("<@870750872504786944> execute ".length))).then(a=>
            {
              lastRet = a;
              if (a.ret!==200) {
                console.log(a);
                lastRet = JSON.parse(lastRet.res);
                sendMessage(msg.d.channel_id,"Failed to respond: "+((lastRet.message && lastRet.code)?"code: "+lastRet.code+"\nmessage: "+lastRet.message:"code: "+a.ret+"\nmessage: "+a.res));
              }
            })
      } catch (err) {
        let errstr = err.toString();
        if (JSON.stringify(errstr).length>=2000)
          errstr = errstr.substring(0,1500);
        replyToMessage(msg.d, errstr);
      }
    }
  }
}
modules.userMemoryPre = {
  name: "userMemoryPre",
  onDispatch: (bot,msg)=>{
    if (msg.t === "GUILD_CREATE") {
      guildNameMap.set(msg.d.id,msg.d.name)
      guildOwnerMap.set(msg.d.id,msg.d.owner_id)
      msg.d.members.forEach(a=>{
        if (!userMap.has(a.user.id)) {
          userMap.set(a.user.id,a.user);
        }
      })
      if (!memberMap.has(msg.d.id))
        memberMap.set(msg.d.id,new Map());
      msg.d.members.forEach(member=>modules.userMemoryPre.mergeMember(msg.d.id,member.user.id,member));
      msg.d.roles.forEach(role=>rolePositions.set(role.id,role.position));
      msg.d.channels.forEach(channel=>channelMap.set(channel.id,channel));
    }
    if (msg.t === "GUILD_UPDATE") {
      if (msg.d.name)
        guildNameMap.set(msg.d.id,msg.d.name)
      if (msg.d.owner_id)
        guildOwnerMap.set(msg.d.id,msg.d.owner_id)
    }
    if (msg.t === "USER_UPDATE") {
      userMap.set(msg.user.id,msg.user);
    }
    if (msg.t === "GUILD_MEMBER_ADD" || msg.t === "GUILD_MEMBER_UPDATE") {
      let member = JSON.parse(JSON.stringify(msg.d));
      let guild_id = member.guild_id;
      modules.userMemoryPre.mergeMember(guild_id,member.user.id,member);
      userMap.set(guild_id,member.user);
    }
    if (msg.t === "GUILD_ROLE_CREATE" || msg.t === "GUILD_ROLE_UPDATE")
      rolePositions.set(msg.d.role.id,msg.d.role.position);
    if (msg.t === "CHANNEL_CREATE" || msg.t === "CHANNEL_UPDATE")
      channelMap.set(msg.d.id,msg.d);
  },
  mergeMember: function (guild_id, user_id, member) {
    // Guild_ID is guarenteed to already be added.
    // Guess not cuz it failed. (if MEMBER_UPDATE happens before GUILD_CREATE, it will not be added)
    let guildMap = memberMap.get(guild_id);
    if (guildMap == undefined)
      memberMap.set(guild_id,guildMap = new Map());
    if (!guildMap.has(user_id))
      guildMap.set(user_id,member);
    else {
      // needs merge
      let old = guildMap.get(user_id);
      if (old.user && !member.user)
        member.user = old.user;
      guildMap.set(user_id,member);
    }
  }
}
modules.userMemoryPost = {
  name: "userMemoryPost",
  onDispatch: (bot,msg) => {
    if (msg.t === "GUILD_MEMBER_REMOVE") {
      memberMap.get(msg.d.guild_id).delete(msg.d.user.id)
    }
  }
}

modules.joinMessages = {
  name: "joinMessages",

  guildJoinChannels:  new Map([["713127035156955276","713444513833680909"]  //wofcs
                               ]),
  guildAuditChannels: new Map([["713127035156955276","750509276707160126"], //wofcs
                               ]),
  messagesJoin: ['Please welcome {USER} to Pyrrhia!',
                 'Please welcome {USER} to Pantala!',
                 'Welcome to the dragons\' den, {USER}!',
                 'Welcome, {USER}! Our wings are open to you!',
                 'Welcome, {USER}! We wish you the power of the wings of fire!',
                 '{USER} came here to hide from the rain. Please give them a warm welcome!',
                 '{USER} arrived! Let the party commence!',
                 '{USER} is here now. Did they bring snacks?',
                 '{USER} is here now. Will this keep Darkstalker away?',
                 'Our NightWing seer foresaw {USER}\'s arrival. And here {USER} is!',
                 'A new dragonet has hatched! Everybody welcome {USER}!',
                 '{USER} has risen from under a mountain! Hopefully {USER} isn\'t Darkstalker...',
                 'The __Eye of Onyx__ fortold that _The One_ is coming! And now here is {USER}! Maybe {USER} is _The One_...?'],
  genJoinMessage: u=> ""+modules.joinMessages.messagesJoin[u.id % modules.joinMessages.messagesJoin.length].replace(/\{USER\}/g,"**"+u.username+"**").replace(/\{PING\}/g,"<@"+u.id+">"),
  messagesLeave: ['{USER} has left.',
                  '{USER} is now gone.',
                  'We will miss you, {USER}.',
                  'Where did {USER} go?',
                  'What will we do now that {USER} has left?',
                  'Oh no! {USER} disappeared!',
                  '{USER} got too close to the dragonflame cacti.',
                  '{USER} left. Hopefully {USER} will dreamvisit us...',
                  '{USER} left Pyrrhia.'],
  genLeaveMessage: u=> ""+modules.joinMessages.messagesLeave[u.id % modules.joinMessages.messagesLeave.length].replace(/\{USER\}/g,"**"+u.username+"**").replace(/\{PING\}/g,"<@"+u.id+">"),
  onDispatch: (bot,msg) => {
    if (msg.t === "GUILD_MEMBER_ADD") {
      let user = msg.d.user; // {username,public_flags,id,discriminator,avatar}
      let guild = msg.d.guild_id;
      // let message = {content: modules.joinMessages.genJoinMessage(user)};
      let message = {embeds:[
        {
          type: "rich",
          timestamp: new Date(msg.time).toISOString(),
          color: 5767045,
          author: {
            name: "A FanWing has arrived!",
            icon_url: "https://cdn.discordapp.com/avatars/"+user.id+"/"+user.avatar+".png?size=256"
          },
          description: modules.joinMessages.genJoinMessage(user),
          fields: [
            {name: "Username",value: user.username+"#"+user.discriminator+" • <@"+user.id+">"}
          ],
          footer: {text:user.id}
        }]};

      // Send with less data
      if (modules.joinMessages.guildJoinChannels.has(guild))
        sendMessage(modules.joinMessages.guildJoinChannels.get(guild),message).then(a=>console.log(a));
      // Add data
      message.embeds[0].fields.push({name:"Account Age",value: timeDuration(snowflakeToTime(user.id), msg.time,999)});
      // Send with more data
      if (modules.joinMessages.guildAuditChannels.has(guild))
        sendMessage(modules.joinMessages.guildAuditChannels.get(guild),message).then(a=>console.log(a));
    }
    if (msg.t === "GUILD_MEMBER_REMOVE") {
      let user = msg.d.user; // {username,public_flags,id,discriminator,avatar}
      let guild = msg.d.guild_id;
      // let message = {content: modules.joinMessages.genLeaveMessage(user)};
      let member = memberMap.get(msg.d.guild_id).get(user.id);
      member.roles.sort((a,b)=>rolePositions.get(b)-rolePositions.get(a));
      let message = {embeds:[
        {
          type: "rich",
          timestamp: new Date(msg.time).toISOString(),
          color: 16729871,
          author: {
            name: "A FanWing has left!",
            icon_url: "https://cdn.discordapp.com/avatars/"+user.id+"/"+user.avatar+".png?size=256"
          },
          description: modules.joinMessages.genLeaveMessage(user),
          fields: [
            {name: "Username",value:user.username+"#"+user.discriminator+" • <@"+user.id+">"},
          ],
          footer: {text:user.id}
        }]};

      // Send with less data
      if (modules.joinMessages.guildJoinChannels.has(guild))
        sendMessage(modules.joinMessages.guildJoinChannels.get(guild),message).then(a=>console.log(a));
      // Add data
      message.embeds[0].fields.push({name:"Time On Server",value:timeDuration(Date.parse(member.joined_at),msg.time,999)})
      message.embeds[0].fields.push({name:"Roles",value:member.roles.length==0?"none":"<@&"+member.roles.join("> <@&")+">"})
      // Send with more data
      if (modules.joinMessages.guildAuditChannels.has(guild))
        sendMessage(modules.joinMessages.guildAuditChannels.get(guild),message).then(a=>console.log(a));
    }
  }
}


modules.inviteLogging = {
  name: "inviteLogging",
  inviteMap: new Map(),
  guildInviteLogChannels: new Map([["713127035156955276","750509276707160126"], //wofcs
                              ]),
  onDispatch: (bot,msg) => {
    let map = modules.inviteLogging.inviteMap;
    if (msg.t === "INVITE_CREATE"){
      guild = msg.d.guild_id;
      message = {
        embeds:[{color:5797096,title:"Invite Created",
          description:"Invite code `"+msg.d.code+"` for "+channelLookup(msg.d.channel_id)+" by "+userLookup(msg.d.inviter.id,msg.d.guild_id)+"."
            +'\n\n'+(msg.d.max_uses===0?"∞":msg.d.max_uses)+" uses"
            +" • "
            +"expires "+(msg.d.max_age==0?"never":"<t:"+(Math.floor(msg.time/1000)+msg.d.max_age)+":R>")+"."
        }]
      }
      if (modules.inviteLogging.guildInviteLogChannels.has(guild))
        sendMessage(modules.inviteLogging.guildInviteLogChannels.get(guild),message).then(a=>console.log(a));
    }
    if (msg.t === "INVITE_DELETE") {
      guild = msg.d.guild_id;
      message = {
        embeds:[{color:5797096,title:"Invite Deleted",
          description:"Invite code `"+msg.d.code+"` for "+channelLookup(msg.d.channel_id)+" by "+userLookup(map.get(msg.d.code).user.id, msg.d.guild_id)+"."
                    +'\n\n'+map.get(msg.d.code).uses+'/'+(map.get(msg.d.code).max_uses===0?"∞":map.get(msg.d.code).max_uses)+" uses"
                    +" • "
                    +"expires "+(map.get(msg.d.code).max_age==0?"never":"<t:"+(Math.floor(map.get(msg.d.code).time/1000)+map.get(msg.d.code).max_age)+":R>")+"."
        }]
      };
      if (modules.inviteLogging.guildInviteLogChannels.has(guild))
        sendMessage(modules.inviteLogging.guildInviteLogChannels.get(guild),message).then(a=>console.log(a));
      map.delete(msg.d.code);
    }
    let invites_promise;
    if (msg.t === "GUILD_MEMBER_ADD") {
      guild = msg.d.guild_id;
      // On join, check invites, find difference, and that was which invite was used.
      invites_promise = discordRequest("guilds/"+msg.d.guild_id+"/invites");
      invites_promise.then(
        response=>{
          let candidates = []
          JSON.parse(response.res).forEach(
            a=>{
              if (map.has(a.code)) console.log("pre: "+map.get(a.code).uses);
              if (map.has(a.code) && a.uses!=map.get(a.code).uses)
                candidates.push({code:a.code,uses:a.uses,max_uses:a.max_uses,max_age:a.max_age,time:Date.parse(a.created_at),inviter_id:a.inviter.id,channel_id:a.channel.id});
            });
          console.log("Candidate Invite Links:");
          console.log(candidates);
          let message_object = {embeds:[]}
          if (candidates.length === 0)
            message_object.embeds.push({embeds:[{color:5797096,title:"Invite Used",
              description:userLookup(msg.d.user.id,msg.d.guild_id)+" joined the server... But no invite code was found to have been used...?"}]});
          else if (candidates.length > 10) {
            message_object.embeds.push({embeds:[{color:5797096,title:"Invite Used",
              description:userLookup(msg.d.user.id,msg.d.guild_id)+" joined the server... But more than 10 possible invites were found to have been used...?"}]});
          } else {
            for (let i=0; i<candidates.length; i++)
              message_object.embeds.push(
                {color:5797096,title:"Invite Used",
                  description:"Invite code `"+candidates[i].code+"` for "+channelLookup(candidates[i].channel_id)+"!"
                    +'\n  Created by: '+userLookup(candidates[i].inviter_id,msg.d.guild_id)
                    +'\n  Used by: '+userLookup(msg.d.user.id,msg.d.guild_id)
                    +'\n\n'+candidates[i].uses+'/'+(candidates[i].max_uses===0?"∞":candidates[i].max_uses)+" uses"
                    +" • "
                    +"expires "+(candidates[i].max_age==0?"never":"<t:"+(Math.floor(candidates[i].time/1000)+candidates[i].max_age)+":R>")+"."
                }
              );
            if (modules.inviteLogging.guildInviteLogChannels.has(guild))
              sendMessage(modules.inviteLogging.guildInviteLogChannels.get(guild),message_object).then(a=>console.log(a));
          }
        });

      // Update invites cache.
      invites_promise.then(modules.inviteLogging.updateInviteMap);
    }

    let gid;
    if (msg.t === "GUILD_CREATE") gid = msg.d.id;
    if (msg.t === "INVITE_CREATE") gid = msg.d.guild_id;

    // Update invites cache.
    if (msg.t === "GUILD_CREATE" || msg.t === "INVITE_CREATE")
      cq.add(cq.high,()=>discordRequest("guilds/"+gid+"/invites").then(modules.inviteLogging.updateInviteMap))
    cq.attempt();

  },
  updateInviteMap: (discordRequestResponse) => {
    try {
    let invites = JSON.parse(discordRequestResponse.res);
    if (invites.message && invites.code && invites.code === 50013) {
      console.log("No perms to view invites for this guild. Skipping.")
    } else {
      invites.forEach(
        a=>{
          modules.inviteLogging.inviteMap.set(a.code,
            {
              code:a.code,
              user:a.inviter,
              max_uses:a.max_uses,
              uses:a.uses,
              max_age:a.max_age,
              time:Date.parse(a.created_at),
              guild_id:a.guild.id,
              channel_id:a.channel.id,
              channel_name:a.channel.name
            });
        });
    }
    } catch (e) {console.error(e); console.trace(); _debug_attempted = discordRequestResponse}
  }
}

modules.disboardReminder = {
  name: "disboardReminder",
  lastBump: null,
  onDispatch: (bot, msg) => {
    if (msg.t === "MESSAGE_CREATE" && msg.d.author.username === "DISBOARD" && msg.d.author.bot === true) {
      console.log("Message from disboard.")
      if (msg.d.content.length === 0 && msg.d.attachments.length === 0 && msg.d.embeds.length === 1) {
        console.log("Message is embed only.")
        let e = msg.d.embeds[0];
        if (e.url === "https://disboard.org/" && e.color === 2406327) {
          console.log("Message matches embed.")
          // now we can be pretty sure a bump was done.
          modules.disboardReminder.lastBump = Date.now();
          console.log("Disboard bumped! Timer set for 2 hours.")
          let bumpLink = "https://discord.com/channels/"+msg.d.guild_id+"/"+msg.d.channel_id+"/"+msg.d.id;
          let guildName = guildLookup(msg.d.guild_id)
          let memberName = userLookup(msg.d.interaction.user.id, msg.d.guild_id)
          sendMessage("870868315793391686",{embeds:[{description:"A [bump]("+bumpLink+") was just done in "+guildName+" by "+memberName}]});
          setTimeout(()=>sendMessage(msg.d.channel_id,{embeds:[{description:"A bump was last done 1 hour and 59 minutes ago [up here]("+bumpLink+")."}]}),2*60*60*1000-60*1000);
          setTimeout(()=>sendMessage("870868315793391686",{embeds:[{description:"A bump was last done 1 hour and 59 minutes ago [here]("+bumpLink+")."}]}),2*60*60*1000-60*1000);
          setTimeout(()=>sendMessage(msg.d.channel_id,"A new bump can now be done with /bump.\nYou can click here to autofill the command: </bump:947088344167366698>"),2*60*60*1000);
          setTimeout(()=>sendMessage("870868315793391686","A new bump can now be done."),2*60*60*1000);
        }
      }
    }
  }
}

modules.threadLogging = {
  name: "threadLogging",
  guildThreadLogChannels: new Map([["713127035156955276","750509276707160126"], //wofcs
                              ]),
  threadChangesToIgnore: ["member_count","message_count","last_message_id","thread_metadata.archive_timestamp"],
  onDispatch: (bot, msg) => {
    let guild = msg.d.guild_id
    if (msg.t === "THREAD_CREATE") {
      let message = {embeds:[{color:5797096,title:"Thread Created",
              description:"<#"+msg.d.id+"> ["+JSON.stringify(msg.d.name)+"](https://discord.com/channels/"+guild+"/"+msg.d.id+"/"+msg.d.id
              +") was created in <#"+msg.d.parent_id+"> #"+channelMap.get(msg.d.parent_id).name+".\n\nThread by <@"+msg.d.owner_id+">."}]}
      if (modules.threadLogging.guildThreadLogChannels.has(guild))
        sendMessage(modules.threadLogging.guildThreadLogChannels.get(guild),message).then(a=>console.log(a));
      threadMap.set(msg.d.id,msg.d)
    }
    if (msg.t === "THREAD_DELETE") {
      let message = {embeds:[{color:5797096,title:"Thread THREAD_DELETE",
              description:"<#"+msg.d.id+"> "+JSON.stringify(msg.d.name)+" was deleted in <#"+msg.d.parent_id+"> #"+channelMap.get(msg.d.parent_id).name+".\n\nSee server audit logs for more information."}]}
      if (modules.threadLogging.guildThreadLogChannels.has(guild))
        sendMessage(modules.threadLogging.guildThreadLogChannels.get(guild),message).then(a=>console.log(a));
    }
    if (msg.t === "THREAD_UPDATE") {
      let diffText = "Unknown changes. See firework logs."
      try {
        let diffo = getDiffObj(threadMap.get(msg.d.id),msg.d)
        let diffs = getDiffsFromDiffObj(diffo)
        diffText = []
        console.log(diffs)
        diffs = diffs.filter(a=>{return modules.threadLogging.threadChangesToIgnore.indexOf(a[1].join("."))==-1})
        diffs.forEach(a=>diffText.push(a[1].join('.')+" -> "+diffToText(getWithin(diffo,a[1]))))
        diffText = "Attributes changed ("+diffs.length+"): \n> "+diffText.join("\n> ")
      } catch (e) {console.error("Diff failed:",e)}
      let message = {embeds:[{color:5797096,title:"Thread Modified",
              description:"<#"+msg.d.id+"> ["+JSON.stringify(msg.d.name)+"](https://discord.com/channels/"+guild+"/"+msg.d.id+"/"+timeToSnowflake(msg.time)
              +") in <#"+msg.d.parent_id+"> #"+channelMap.get(msg.d.parent_id).name+" created by <@"+msg.d.owner_id+"> was modified."
              +"\n"+diffText
            }]}
      threadMap.set(msg.d.id,msg.d)
      if (modules.threadLogging.guildThreadLogChannels.has(guild))
        sendMessage(modules.threadLogging.guildThreadLogChannels.get(guild),message).then(a=>console.log(a));
    }
    if (msg.t === "GUILD_UPDATE") {
      sendMessage("750509276707160126",{embeds:[{color:5797096,title:"Server Modified",
              description:"The server was modified in some way."
              +"\n(This could be rename, server icon change, owner change, boost, automod, or similar!)"}]});
    }

    // Should also read threads from active threads on start.
    if (msg.t === "GUILD_CREATE" && msg.d.threads)
      msg.d.threads.forEach(a=>threadMap.set(a.id,a));
  }
}

modules.infoHelpUptime = {
  name: "infoHelpUptime",
  onDispatch: (bot,msg) => {
    if (msg.t === "MESSAGE_CREATE"){
      let prefix = "<@"+bot.self.id+">";
      let prefix2 = "<@!"+bot.self.id+">";
      let message = msg.d.content.replace(/[ \t\n]+/g," ");
      if (message.startsWith(prefix) || message.startsWith(prefix2)) {
        // message of "@firework{textwithoutspaces}" will be interpreted as "@firework" or "".
        message = message.indexOf(" ")==-1?"":message.substring(message.indexOf(" "));
        if (/^(?:| prefix)$/i.test(message)) {
          replyToMessage(msg.d,"Firework's prefix is `@"+bot.self.username+"#"+bot.self.discriminator+"` or `<@"+bot.self.id+">`");
        }
        if (/^(?: uptime| online| statu?s?| info)$/i.test(message)) {
          let now = Date.now();
          let online = timeDuration(bot.timeStart, now);
          let reconnect = timeDuration(bot.timeLastReconnect, now);
          let reconnect_count = bot.types.get("RESUMED");
          reconnect_count = reconnect_count+(reconnect_count===1?" time":" times");
          reconnect = (reconnect==null)?"never":reconnect+" ago";
          replyToMessage(msg.d,"Firework bot ("+version+")\n"
            +"> "+"Shard count: "+1+"\n"
            +"> "+"Online for: "+online+"\n"
            +"> "+"Received: "+bot.contacts.length+" packets\n"
            +"> "+"Sent: "+sents.length+" packets\n"
            +"> "+"Seen: "+bot.types.get("MESSAGE_CREATE")+" messages\n"
            //+"> "+"Times reconnected: "+reconnect_count+"\n"
            //+"> "+"Last reconnect: "+reconnect
            );
        }
        if (/^(?: help)$/i.test(message)) {

          staff = isStaff(msg.d.author.id,msg.d.guild_id);
          dev = isDev(msg.d.author.id,msg.d.guild_id);
          hasModuleEmbeds = bot.modules.filter(a=>a.name==="embeds").length>0 && staff;
          hasModuleXp = bot.modules.filter(a=>a.name==="xp").length>0;
          hasModuleThreadAlive = bot.modules.filter(a=>a.name==="threadAlive").length>0 && staff;
          hasModuleSaveLoad = bot.modules.filter(a=>a.name==="saveLoad").length>0 && dev;
          hasModuleWhois = bot.modules.filter(a=>a.name==="whois").length>0;
          hasModuleBoosters = bot.modules.filter(a=>a.name==="boosters").length>0;
          hasModuleListModules = bot.modules.filter(a=>a.name==="listModules").length>0 && dev;

          replyToMessage(msg.d,"Firework bot ("+version+")\n"
            +"> "+"Default Commands:\n"
            +"> "+" • `help  ` - Displays this\n"
            +"> "+" • `prefix` - The prefix (`@"+bot.self.username+"#"+bot.self.discriminator+"` or `<@"+bot.self.id+">`)\n"
            +"> "+" • `stats ` - Displays uptime and other basic statistics\n"
            +(!hasModuleEmbeds?"":
             "> "+"Embeds Module Commands:\n"+
             "> "+" • `embed` - (admin) Embed help\n")
            +(!hasModuleXp?"":
             "> "+"XP Module Commands:\n"+
             "> "+" • `rank [uid] ` - View your server rank and xp\n"+
             "> "+" • `leaderboard` - View the levels of the top 10 users in the server\n"+
             "> "+" • `           ` - More coming soon!\n")
            +(!hasModuleThreadAlive?"":
             "> "+"Thread Alive Module Commands:\n"+
             "> "+" • `thread alive list     ` - (admin) List threads being kept from being archived\n"+
             "> "+" • `thread alive add [tid]` - (admin) Add a thread to be kept from being archived\n")
            +(!hasModuleSaveLoad?"":
             "> "+"Save/Load Module Commands:\n"+
             "> "+" • `save` - (admin) Saves config and database to file\n"+
             "> "+" • `load` - (admin) Loads config and database from file\n"+
             "> "+" • `dump` - (admin) Dumps bot contents for troubleshooting; Will also trigger a save.\n")
            +(!hasModuleWhois?"":
             "> "+"Whoami Module Commands:\n"+
             "> "+" • `whoami     ` - User details for yourself\n"+
             "> "+" • `whois [uid]` - User details for any other user (in this server or not)\n")
            +(!hasModuleBoosters?"":
             "> "+"Boosters Module Commands:\n"+
             "> "+" • `boosts` - Lists the server boosters\n")
            +(!hasModuleListModules?"":
             "> "+"List Modules Module Commands:\n"+
             "> "+" • `listmodules` - Lists the modules that Firework currently has active\n")
          )
        }
      }
    }
  }
}

modules.embeds = {
  name: "embeds",
  onDispatch: (bot,msg) => {
    // if is new message and from admin ->
    // parse contents (or next message), and send that data as an embed to the same channel.
    if (msg.t === "MESSAGE_CREATE" /*&& msg.d.member.roles*/)
      if (isStaff(msg.d.author.id,msg.d.guild_id)) {
        let startString = "<@"+bot.self.id+"> embed";
        let startString2 = "<@!"+bot.self.id+"> embed";
        if (msg.d.content.startsWith(startString) || msg.d.content.startsWith(startString2)) {
          if (msg.d.content === startString || msg.d.content === startString2)
            sendMessage(msg.d.channel_id,{"content":"Send an embed from "+bot.self.username+" using the embed command:\n"
              +"> <@"+bot.self.id+"> embed\n> example plain-text embed\nor\n"
              +"> <@"+bot.self.id+'> embed\n> {"embeds":[{"color":16762164,"title":"This is a title","description":"This is the main content of the embed."}]}',
              "embeds":[
                {"description":"example plain-text embed"},
                {"color":16762164,"title":"This is a title","description":"This is the main content of the embed."}
              ]
            });
          else {
            let str = msg.d.content.substring(startString.length+1);
            try {
              let obj = JSON.parse(str);
              sendMessage([msg.d.channel_id,"883172908418084954"],obj).then(a=>{
                console.log(a);
                a.res = JSON.parse(a.res);
                sendMessage([msg.d.channel_id,"883172908418084954"],"Response received:\n```json\n"
                  +JSON.stringify(
                    {error_code:a.ret,message_id:a.res.id,flags:a.res.flags,timestamp:a.res.timestamp,edited_timestamp:a.res.edited_timestamp},
                    null,2)+"```");
              })
            } catch (err) {
              sendMessage([msg.d.channel_id,"883172908418084954"],{embeds:[{description:str}]}).then(a=>{
                console.log(a);
                a.res = JSON.parse(a.res);
                sendMessage([msg.d.channel_id,"883172908418084954"],"Response received:\n```json\n"
                  +JSON.stringify(
                    {error_code:a.ret,message_id:a.res.id,flags:a.res.flags,timestamp:a.res.timestamp,edited_timestamp:a.res.edited_timestamp},
                    null,2)+"```");
              })
            }
          }
        }
      }

    // if is getembed, check linked message/replied message and print the embed data (if short enough).
  }
}

modules.threadAlive = {
  name: "threadAlive",
  threads: new Map(),
  threadAlive: null,
  onDispatch: (bot,msg) => {
    if (msg.t === "THREAD_UPDATE" && config.threadAlive.has(msg.d.id) && msg.d.thread_metadata.archived == true)
      modules.threadAlive.keepThreadAlive(msg.d.id);

    if (msg.t === "MESSAGE_CREATE") {
      let command = commandAndPrefix(msg.d.content);
      if (!command || command.shift() !== "thread" || command.shift() !== "alive")
        return;
      let action = command.shift(); // add or remove
      let tid = command.shift();
      if (action === "list") {
        replyToMessage(msg.d,"* "+[...config.threadAlive].map(a=>threadMap.get(a)).map(a=>a?"<#"+a.id+"> - "+a.name:a).join("\n* "))
        return;
      }
      if (action !== "add" && action !== "remove") {
        modules.threadAlive.showUsage(msg.d);
      }
      let gid = msg.d.guild_id;
      if (!tid && threadMap.has(msg.d.channel_id))
        return modules.threadAlive.addThread(gid,msg.d.channel_id,msg.d);

      if (threadMap.has(tid)) {
        let thread = threadMap.get(cid);
        if (gid === thread.guild_id)
          // Add thread to keepalive list
          modules.threadAlive.addThread(gid,tid,msg.d);
      } else {
        // verify tid is a snowflake
        // A thread must be created after the server and not in the future.
        let valid = false;
        try {
          valid = (snowflakeToTime(tid)>snowflakeToTime(gid)) && (new Date()>snowflakeToTime(tid))
        } catch (e) {}
        if (valid) {
          discordRequest('https://discord.com/api/v9/channels/'+tid).then(a=>{
            let thread = JSON.parse(a.res);
            if (a.ret !== 200) {
              // Thread Not Found
              modules.threadAlive.threadNotFound(msg.d);
            } else {
              if (!thread.thread_metadata) {
                // Thread Not Found
                modules.threadAlive.threadNotFound(msg.d);
              } else {
                threadMap.set(thread.id,thread);
                // Add thread to keepalive list
                modules.threadAlive.addThread(gid,tid,msg.d);
              }
            }
          });
        } else {
          // Thread Not Found
          modules.threadAlive.threadNotFound(msg.d);
        }
      }
    }
  },
  addThread: (gid, tid, d) => {
    let thread = threadMap.get(tid);
    if (thread.guild_id!==gid)
      return modules.threadAlive.threadNotFound(d);
    config.threadAlive.add(tid);
    save();
    replyToMessage(d, "Thread added to keepThreadAlive list.");
    if (thread.thread_metadata.archived)
      modules.threadAlive.keepThreadAlive(thread.id);
  },
  threadNotFound: (d) => {
    replyToMessage(d, "Thread not found.");
  },
  showUsage: (d) => {
    replyToMessage(d, "Thread Keep Alive\n> Command:\n>  • `thread alive add [tid]`")
  },
  // Duration 1440 is 1 day for non-boosted servers
  // Duration 4320 is 3 days for tier 1 boosted servers
  // Duration 10080 is 7 days for tier 2 boosted servers
  keepThreadAlive: (channel_id, duration = 1440) => {
    discordRequest("https://discord.com/api/v9/channels/"+channel_id,{"archived":false},"PATCH");
    // discordRequest("https://discord.com/api/v9/channels/"+channel_id,{"archived":false,"locked":false,"auto_archive_duration":duration},"PATCH");
  }
}

modules.xp = {
  name: "xp",
  xp_per_message: [15,25],
  xp_rate: 1,
  ignored_channels: new Set([
    "728676188641558571", // #spamming
    "713159752296693792", // #counting
    "744059079994900623", // #one-word-story
    "730170402109653112"  // #advertising
  ]),
  ignored_roles: new Set(["778861562965393438"]), // Muted
  level_nofif: new Map([
      [
        "713127035156955276", // WOFCS
        {
          message: "Awesome job {player}, you just flew to up to **LEVEL {level}**!\n<:heartdragon:730252985594150942> <:boop:738987120022257696> <:confetti:748591549444784238>",
          announce_channel: "750152027283259513" // #levels
        }
      ]
    ]),
  onDispatch: (bot,msg) => {
    if (msg.t !== "MESSAGE_CREATE")
      return;

    let m = modules.xp;

    console.log("can earn xp?");
    if (m.canEarnXp(m, msg.d, msg.time))
      m.addXp(m, msg.d.guild_id, msg.d.author.id, msg.time);

    let target = m.isRequestingLevels(m, msg.d);
    if (target)
      m.replyWithXp(m, target, msg.d, msg.time);

    if (m.isRequestingLeaderboard(m, msg.d))
      m.replyWithLb(m, msg.d.guild_id, msg.d, msg.time)

    // if (getleaderboard())
    //   replywithleaderboard()
  },
  lvlToXp: lvl => (5*lvl*(7+lvl)*(13+2*lvl))/6,
  xpToNextLvl: lvl => 5*lvl*lvl + 50*lvl + 100,
  max_lvl: 200,
  lvls: undefined,
  xpToLvl: xp => {
    let m = modules.xp;
    if (!m.lvls)
      m.lvls = [...Array(modules.xp.max_lvl+1)].map((_,i)=>modules.xp.lvlToXp(i));
    if (xp>m.lvls[modules.xp.max_lvl])
      return 9999;
    return m.lvls.map(a=>a-xp>0).indexOf(true)-1;
  },
  canEarnXp: (m, d, time) => {
    let canEarn = true;

    if (d.author.bot) {
      console.log("cannot: is bot")
      canEarn = false;
    }

    if (m.ignored_channels.has(d.channel_id)) {
      console.log("cannot: forbidden channel")
      canEarn = false;
    }

    // webhooks have no d.member element
    if (d.member && d.member.roles.filter(a=>m.ignored_roles.has(a)).length>0) {
      console.log("cannot: forbidden role")
      canEarn = false;
    }

    // console.log(canEarn)
    let lastTime = m.fetchXp(d.guild_id,d.author.id).lastxptime
    if ((time - lastTime) > 60000) {// more than one minute since last xp granted
      // console.log("exit: "+canEarn)
      return canEarn;
    }

    console.log("cannot: too soon")
    return false;
  },
  fetchXp: (gid, uid) => {
    // Get guild map
    if (!userXpMap.has(gid))
      userXpMap.set(gid, new Map());
    let gmap = userXpMap.get(gid);

    // Get user xpobj
    if (!gmap.has(uid))
      return {xp:0,lvl:0,message_count:0,lastxptime:0};

    xpobj = gmap.get(uid);

    // message_count was added later and may not exist.
    if (!xpobj.message_count)
      xpobj.message_count=0;

    return xpobj;
  },
  checkLevelup: (xpobj,gid,uid) => {
    let expectedLvl = modules.xp.xpToLvl(xpobj.xp);
    let currentLvl = xpobj.lvl;
    if (expectedLvl > currentLvl) {
      // Level up notification
      let notifobj = modules.xp.level_nofif.get(gid);
      if (notifobj) {
        sendMessage(notifobj.announce_channel,notifobj.message.replaceAll("{player}","<@"+uid+">").replaceAll("{level}",expectedLvl));
        // sendMessage(c_fire,notifobj.message.replaceAll("{player}","<@"+uid+">").replaceAll("{level}",expectedLvl));
      }
    }
    // Update value.
    if (expectedLvl !== currentLvl) {
      xpobj.lvl = expectedLvl;
      userXpMap.get(gid).set(uid,xpobj);
    }
  },
  addXp: (m, gid, uid, time, amt) => {
    let defaultxp = m.xp_per_message;
    if (amt == undefined)
      amt = m.xp_rate*(defaultxp[0]+Math.floor(Math.random()*(defaultxp[1]-defaultxp[0]+1)));

    let xpobj = m.fetchXp(gid,uid);

    console.log("Adding "+amt+" xp to "+uid+" ("+xpobj.xp+"->"+(xpobj.xp+amt)+") in "+gid+".")
    xpobj.xp += amt;
    xpobj.message_count += 1;
    xpobj.lastxptime = time;
    userXpMap.get(gid).set(uid,xpobj);

    modules.xp.checkLevelup(xpobj,gid,uid);
  },
  isRequestingLevels: (m, d) => {
    let command = commandAndPrefix(d.content);
    if (!command)
      return false;
    let next = command.shift();
    if (next.toLowerCase() !== "rank")
      return false;
    return command.length>0?command[0]:d.author.id;
  },
  isRequestingLeaderboard: (m, d) => {
    let command = commandAndPrefix(d.content);
    return (command && command.shift().toLowerCase() === "leaderboard")
  },
  replyWithXp: (m, target, d, time) => {
    let user = d.author;
    let gid = d.guild_id;
    if (memberMap.get(gid).has(target))
      user = memberMap.get(gid).get(target).user;

    let xpobj = m.fetchXp(gid,user.id);
    m.checkLevelup(xpobj,gid,user.id);
    let rank = m.getRank(m,gid,user.id);
    let remxp = xpobj.xp-m.lvlToXp(xpobj.lvl)
    let levelXpReq = m.xpToNextLvl(xpobj.lvl);
    let percent = Math.floor(1000*remxp/levelXpReq)/10.0;

    let xp_message = {embeds:[
        {
          color:5797096,
          author:{name:user.username+"#"+user.discriminator+"'s Rank and XP"},
          footer:{text:user.id},
          timestamp: new Date(time).toISOString(),
          thumbnail: {url: "https://cdn.discordapp.com/avatars/"+user.id+"/"+user.avatar+".webp?size=320"},
          fields: [
            {name:"Rank",value:rank+" place",inline:true},
            {name:"Level",value:xpobj.lvl,inline:true},
            {name:"XP",value:xpobj.xp,inline:true},
            {name:"Progress",value:remxp+"/"+levelXpReq+" ("+percent+"%) to level "+(xpobj.lvl+1)}
          ]
        }
      ]};
    replyToMessage(d, xp_message);
  },
  replyWithLb: (m, gid, d, time) => {
    let lb = m.getLeaderboard(gid);
    if (lb.filter(a=>a[0]===d.author.id).length===0)
      lb.push([d.author.id,m.fetchXp(gid,d.author.id)])

    let content = 
        lb.map(
          a=>
            m.getRank(m,d.guild_id,a[0],a[0]!==d.author.id?lb:null)
            +"\t—\tLevel "+a[1].lvl+" ("+a[1].xp+"xp)"
            +"\t— <@"+a[0]+">")
        .join("\n")

    let lb_message = {embeds:[
        {
          color:5797096,
          title: "Server XP Leaderboard",
          description: content,
          footer:{text:d.author.id},
          timestamp: new Date(time).toISOString()
        }
      ]};
    replyToMessage(d, lb_message);
  },
  /** For user in guild -> count how many have xp above **/
  getRank: (m, gid, uid, gxps=null) => {
    let xpobj = m.fetchXp(gid,uid);
    if (!gxps) gxps = [...userXpMap.get(gid).entries()].filter(a=>memberMap.get(gid).has(a[0]));
    let usersAbove = gxps.filter(a=>a[1].xp>xpobj.xp);
    let rank = String(usersAbove.length+1);

    let lastNumber = rank[rank.length-1];
    let suffix = lastNumber=='1'?"st" : lastNumber=='2'?"nd":lastNumber=='3'?"rd":"th";
    if (rank == "11" || rank == "12" || rank == "13")
      suffix = "th";
    return rank + suffix;
  },
  /** For a guild -> Find the users with the top 10 xp **/
  getLeaderboard: (gid, ct=10) => {
    let gxp = [...userXpMap.get(gid).entries()];

    // Only allow members currently in server
    let members = memberMap.get(gid)
    gxp = gxp.filter(a=>members.has(a[0]))

    // Sort all users by xp (and when earned to break ties: first to the xp ranks higher.)
    // Apparently this takes 0-1 ms for 1164 entries...
    let sorted = gxp.sort((a,b)=>a[1].xp!==b[1].xp?b[1].xp-a[1].xp:a[1].lastxptime-b[1].lastxptime);

    if (sorted.length<=ct)
      return sorted;
    return sorted.filter(a=>a[1].xp>=sorted[ct-1][1].xp);
  }
}

modules.saveLoad = {
  name: "saveLoad",
  onDispatch: (bot, msg) => {

    if (msg.t !== "MESSAGE_CREATE" || !isStaff(msg.d.author.id,msg.d.guild_id))
      return;
    let command = commandAndPrefix(msg.d.content);
    if (!command)
      return;

    let first = command.shift()
    if (first === "save") {
      save()
      replyToMessage(msg.d,"Save attempted.")
    }
    if (first === "load") {
      load()
      replyToMessage(msg.d,"Load attempted.")
    }
    if (first === "dump") {
      replyToMessage(msg.d,"Attempting to dump bot contents for troubleshooting...\nThis will also save config and database to file.\nThis may cause a crash if bot is unstable.")
      bot.cleanup()
      replyToMessage(msg.d,"Bot didn't crash. Will assume dump was successful.")
    }
  }
}

modules.whois = {
  name: "whois",
  cooldownTime: 10000,
  commandCooldown: new Map(),
  onDispatch: (bot, msg) => {
    if (msg.t !== "MESSAGE_CREATE")
      return;
    let command = commandAndPrefix(msg.d.content);
    if (!command)
      return;

    // Todo:
    //  - Shares this server
    //  - User has previously been on this server
    //  - bot/webhook?
    //  - if shares: nitro? boosts? roles? time on server? nickname? name/nick history? message count? vc time?

    let first = command.shift().toLowerCase()
    if (first !== "whoami" && first !== "whois")
      return;

    // console.log("whoami seen")

    let uid = command.shift()
    if (uid === undefined)
      uid = msg.d.author.id;

    let user;
    if (userMap.has(uid)) {
      // If on mutual server, this will be up to date.
      user = userMap.get(uid);
      modules.whois.part2(msg,user.id,user);
    } else {
      // ensure is snowflake
      let snowflake = stringToSnowflake(uid)
      if (!snowflake) {
        replyToMessage(msg.d,JSON.stringify(uid)+" is not a valid user id!");
        return;
      }
      let webhook = modules.webhookWatch.webhookMap?.get(msg.d.guild_id)?.[uid];
      if (webhook)
        modules.whois.part2webhook(msg,webhook.id,webhook);
      else {
        discordRequest('users/'+snowflake).then(a=>{
          if (a.ret === 200) {
            user = JSON.parse(a.res);
            userMap.set(user.id,user);
            modules.whois.part2(msg,user.id,user);
          } else if (a.ret === 404) {
            replyToMessage(msg.d, "No users exists with that id.");
          } else {
            replyToMessage(msg.d,"Something went wrong:\n\t"+a.ret);
          }
        });
      }
    }
  },
  part2: (msg,uid,user) => {
    // Might be wrong if user has left guild since bot started.
    let sharesGuild = (!!msg.d.guild_id) && memberMap.get(msg.d.guild_id).has(uid);

    avatar = "https://cdn.discordapp.com/avatars/"+uid+"/"+user.avatar+".png?size=4096"
    let embed = {
        "author": {
          "name": user.username,
          "icon_url": avatar
        },
        "title": user.username+"#"+user.discriminator,
        "url": avatar,
        "color": null,
        "fields": [
          {
            "name": "Account Age",
            "inline": true,
            "value": timeDuration(snowflakeToTime(uid),msg.time)
          }
        ],
        "footer": { "text": user.id },
        "timestamp": new Date(snowflakeToTime(user.id)).toISOString(),
        "thumbnail": { "url": avatar }
      }

      let isOwner = msg.d.guild_id && guildOwnerMap.get(msg.d.guild_id) === uid;
      let isNitro = {'163718745888522241':'2018-07-16T17:04z','642971818965073931':'2022-06-13T05:20z'}[uid]
      let boostTime = {'163718745888522241':'2021-03-18T20:29z','642971818965073931':'2022-06-13T05:35z'}[uid]
      boostTime = (msg.time-Date.parse(boostTime))/1000/60/60/24/365*12
      if (user.public_flags) {

        embed.fields.push({
            "name": "Badges",
            "inline": true,
            "value": modules.whois.flagToBadgeEmotes(user.public_flags,isOwner,isNitro,boostTime)+(isNitro?"":"\nNitro badges may be old/missing.")
          })
      }

    replyToMessage(msg.d,{embeds:[embed]})
    // if shares guild: roles + server online time
  },
  part2webhook: (msg,wid,webhook) => {
    avatar = webhook.avatar??"https://cdn.discordapp.com/avatars/"+wid+"/"+webhook.avatar+".png?size=4096"
    let embed = {
        "author": {
          "name": webhook.user.username+"#"+webhook.user.discriminator,
          "icon_url": "https://cdn.discordapp.com/avatars/"+webhook.user.id+"/"+webhook.user.avatar+".png?size=4096"
        },
        "title": "Webhook: "+webhook.name,
        "color": null,
        "fields": [
          {
            "name": "Webhook Age",
            "inline": true,
            "value": timeDuration(snowflakeToTime(wid),msg.time)
          },
          {
            "name": "Channel",
            "inline": true,
            "value": channelLookup(webhook.channel_id)
          }
        ],
        "footer": { "text": wid },
        "timestamp": new Date(snowflakeToTime(wid)).toISOString()
      }

    replyToMessage(msg.d,{embeds:[embed]})
    // if shares guild: roles + server online time
  },
  flagToBadgeEmotes: (flags,owner,nitro,boost) => {
    
    flagBadges =                                                  // From: https://flags.lewistehminerz.dev/
      [
        "<:badge_discord_staff:1000072146657226872>",             // DISCORD_EMPLOYEE
        "<:badge_partnered_server_owner:1000072164327837826>",    // DISCORD_PARTNER
        "<:badge_hypesquad_events:1000072160188059698>",          // HYPESQUAD_EVENTS
        "<:badge_bug_hunter_level_1:1000072139770187878>",        // BUG_HUNTER_LEVEL_1
        null, // undocumented                                       (MFA_SMS)
        null, // undocumented                                       (PREMIUM_PROMO_DISMISSED)
        "<:badge_house_bravery:1000072155448483880>",             // HOUSE_BRAVERY
        "<:badge_house_brilliance:1000072158007005294>",          // HOUSE_BRILLIANCE
        "<:badge_house_balance:1000072153103868045>",             // HOUSE_BALANCE
        "<:badge_early_supporter:1000072151191261215>",           // EARLY_SUPPORTER
        "<:badge_team_pseudo_user:1000104098043011112>",          // TEAM_PSEUDO_USER
        null, // undocumented
        null, // undocumented                                       (SYSTEM)
        null, // undocumented                                       (HAS_UNREAD_URGENT_MESSAGES)
        "<:badge_bug_hunter_level_2:1000072142337081364>",        // BUG_HUNTER_LEVEL_2
        null, // undocumented
        "<:badge_verified_bot:1007791789794656317>",//CustomEmoji // VERIFIED_BOT
        "<:badge_early_bot_dev:1000072148829864007>",             // VERIFIED_BOT_DEVELOPER
        "<:badge_community_moderator:1000072144119677018>",       // CERTIFIED_MODERATOR
        "<:badge_supports_commands:1000072168576647358>",         // BOT_HTTP_INTERACTIONS
        null, // undocumented                                       (SPAMMER)
        null, // undocumented                                       (DISABLE_PREMIUM)
        "<:badge_active_developer:1040356836240531516>" // 1<<22  // ACTIVE_DEVELOPER
      ];
                                                            // 1<<33 HIGH_GLOBAL_RATE_LIMIT
                                                            // 1<<34 DELETED
                                                            // 1<<35 DISABLED_SUSPICIOUS_ACTIVITY
                                                            // 1<<36 SELF_DELETED
                                                            // 1<<37 PREMIUM_DISCRIMINATOR
                                                            //
                                                            // 1<<41 DISABLED
                                                            //
                                                            // 1<<44 QUARANTINED
    boostBadges = 
      {
         0: "",
         1: "<:badge_boost_1_month:1000081834203414698>",
         2: "<:badge_boost_2_months:1000081836631916704>",
         3: "<:badge_boost_3_months:1000081839492431912>",
         6: "<:badge_boost_6_months:1000081841912565802>",
         9: "<:badge_boost_9_months:1000081844324286524>",
        12:"<:badge_boost_12_months:1000081846786343012>",
        15:"<:badge_boost_15_months:1008176169356632124>",
        18:"<:badge_boost_18_months:1000081849340666036>",
        24:"<:badge_boost_24_months:1000081898925731901>"
      };

    let ret = 
        flags         // Flags is a binary encoded number
        .toString(2)  // Convert to base two
        .split(/(.)/).filter((a,i)=>i%2) // Split digits
        .reverse()    // bigendian -> littleendian
        .map(a=>a=='1') // '1' and '0' to boolean values
        .map((a,i)=>a?flagBadges[i]??":unknown_flag_"+i+":":"") // Extract badges, if exist
        .join(""); // join badges together
    if (nitro) ret += "<:badge_nitro:1000072162557821030>"
    if (boost>0) {
      boost = boost<1?1:Math.floor(boost);
      while (!boostBadges[boost]) boost--;
      ret += boostBadges[boost]
    }
    if (owner) ret += "\n<:badge_server_owner:1000072165976199178>"

    return ret;
  }
}


modules.whatis = {
  name: "whatis",
  cooldownTime: 10000,
  commandCooldown: new Map(),
  onDispatch: async (bot, msg) => {
    if (msg.t !== "MESSAGE_CREATE")
      return;
    let command = commandAndPrefix(msg.d.content);
    if (!command)
      return;

    let first = command.shift().toLowerCase()
    if (first !== "whatis")
      return;

    let id = command.shift()
    let snowflake = stringToSnowflake(id)
    if (!snowflake) {
      replyToMessage(msg.d,JSON.stringify(id)+" is not a valid user id!");
      return;
    }

    let m = modules.whatis;
    if (m.commandCooldown.get(msg.d.id) > msg.time - m.cooldownTime) {
      replyToMessage(msg.d,"You've recently used this command! Please wait "+timeDuration(msg.time-m.commandCooldown.get(msg.d.author.id)-m.cooldownTime)+".");
      return;
    }

    replyToMessage(msg.d,"Attempting...");

    let user = userMap.get(snowflake);
    let userFound = user?"**Found**":"_Unknown_";
    if (!user) {
      let req = await discordRequest('users/'+snowflake)
      switch (req.ret) {
               case 404: userFound = "_Doesn't Exist_";
        break; case 403: userFound = "**Exists**";
        break; case 200: userFound = "**Found**"; userMap.set(snowflake,user = JSON.parse(req.res));
        break;  default: userFound = "_Unknown (Error: "+req.ret+")_";
      }
    }

    // Webhook
    let webhook = modules.webhookWatch.webhookMap?.get(msg.d.guild_id)?.[snowflake];
    let webhookFound = webhook?"**Found**":"_Unknown_"
    if (!webhook) {
      let req = await discordRequest('webhooks/'+snowflake)
      switch (req.ret) {
               case 404: webhookFound = "_Doesn't Exist_";
        break; case 403: webhookFound = "**Exists**";
        break; case 200: webhookFound = "**Found**";
          webhook = JSON.parse(req.res);
          let gid = webhook.guild_id;
          let whm = modules.webhookWatch.webhookMap;
          if (!whm?.has(gid)) whm.set(gid,Object.fromEntries([[snowflake,webhook]]));
          else {
            whmg = whm?.get(gid);
            if (whmg) whmg[snowflake] = webhook
          }
        break;  default: webhookFound = "_Unknown (Error: "+req.ret+")_";
      }
    }

    // Guild
    let guild = !!guildOwnerMap.get(snowflake);//guildMap?.get(snowflake);
    let guildFound = guild?"**Found**":"_Unknown_"
    if (!guild) {
      let req = await discordRequest('guilds/'+snowflake+'/emojis')
      switch (req.ret) {
               case 404: guildFound = "_Doesn't Exist_";
        break; case 403: guildFound = "**Exists**";
        break; case 200: guildFound = "**Found**"; /* guildMap.set(snowflake, */ //guild=JSON.parse(await discordRequest('guilds/'+snowflake).res) /* / */
        break;  default: guildFound = "_Unknown (Error: "+req.ret+")_";
      }
    }

    // Channel
    let channel = channelMap.get(snowflake);
    let channelFound = channel?"**Found**":"Unknown"
    if (!channel) {
      let req = await discordRequest('channels/'+snowflake)
      switch (req.ret) {
               case 404: channelFound = "_Doesn't Exist_";
        break; case 403: channelFound = "**Exists**";
        break; case 200: channelFound = "**Found**"; channelMap.set(snowflake,channel);
        break;  default: channelFound = "_Unknown (Error: "+req.ret+")_";
      }
    }

    // Application
    let application = null;
    let applicationFound = application?"**Found**":"_Unknown_"
    if (!application) {
      let req = await discordRequest('applications/'+snowflake+'/commands/160123456789012345')
      switch (req.ret) {
               case 404: applicationFound = "_Doesn't Exist_";
        break; case 403: applicationFound = "**Exists**";
        break; case 200: applicationFound = "**Found**";
        break;  default: webhookFound = "_Unknown (Error: "+req.ret+")_";
      }
    }

    // Emote
    let emote = null;
    let emoteFound = "_Unknown_";
    if (!emote) {
      let req = await discordRequest('https://cdn.discordapp.com/emojis/'+snowflake+'.webp?size=16',null,null,null,false,false);
      emoteFound = req.ret == 200 ? "**Exists**" : req.ret == 404 ? "_Doesn't Exist_" : "_Unknown (Error: "+req.ret+")_";
      emote = req.ret == 200;
    }

    //Sticker
    let sticker = null;
    let stickerFound = "_Unknown_";
    if (!sticker){
      let req = await discordRequest('https://media.discordapp.net/stickers/'+snowflake+'.webp?size=16&passthrough=false',null,null,null,false,false);
      stickerFound = req.ret == 200 ? "**Exists**" : req.ret == 404 ? "_Doesn't Exist_" : "_Unknown (Error: "+req.ret+")_";
      sticker = req.ret == 200;
    }

    // Message
    let messageFound = "Unknown (requires read-channel-history for specific channel)";
    let eventFound = "Unknown (requires view-events for specific server)";
    let attachmentFound = "Unknown (requires channel id, message id, and exact file name)";

    // Role
    let role = rolePositions.has(snowflake)
    let roleFound = role?"**Exists**":"_Unknown_"

    let embed = {
        // "author": {
        //   "name": msg.d.author.user.username+"#"+msg.d.author.user.discriminator,
        //   "icon_url": "https://cdn.discordapp.com/avatars/"+msg.d.author.user.id+"/"+msg.d.author.user.avatar+".png?size=4096"
        // },
        "title": "What-Is: "+snowflake,
        "color": null,
        "fields": [
          {
            "name": "Server",
            "inline": true,
            "value": guildFound //+ (guild?.name?': '+JSON.stringify(guild.name):"")
          },
          {
            "name": "Channel",
            "inline": true,
            "value": channelFound //+ (channel?.name?': #'+channel.name:"")
          },
          {
            "name": "User",
            "inline": true,
            "value": userFound + (user?.username?': @'+user.username+"#"+user.discriminator:"")
          },
          {
            "name": "Webhook",
            "inline": true,
            "value": webhookFound
          },
          {
            "name": "Emote",
            "inline": true,
            "value": (emote?"[":"") + emoteFound + (emote?'](https://cdn.discordapp.com/emojis/'+snowflake+'.png?size=4096)':"")
          },
          {
            "name": "Sticker",
            "inline": true,
            "value": (sticker?"[":"") + stickerFound + (sticker?'](https://cdn.discordapp.com/stickers/'+snowflake+'.png?size=4096)':"")
          },
          {
            "name": "Application",
            "inline": true,
            "value": applicationFound
          // },
          // {
          //   "name": "Role",
          //   "inline": true,
          //   "value": roleFound
          // },
          // {
          //   "name": "Message",
          //   "inline": true,
          //   "value": messageFound
          // },
          // {
          //   "name": "Event",
          //   "inline": true,
          //   "value": eventFound
          // },
          // {
          //   "name": "Attachment",
          //   "inline": true,
          //   "value": attachmentFound
          }
        ],
        "footer": { "text": snowflake },
        "timestamp": new Date(snowflakeToTime(snowflake)).toISOString()
      }

    replyToMessage(msg.d,{embeds:[embed]})
  }
}

modules.boosters = {
  name:"boosters",
  onDispatch: (bot,msg) => {
    if (msg.t !== "MESSAGE_CREATE" || !msg.d.guild_id)
      return;
    let command = commandAndPrefix(msg.d.content);
    if (!command)
      return;
    let first = command.shift().toLowerCase()
    if (first !== "boosters" && first !== "boosts")
      return;

    // Apparently this endpoint exists, so we dont need to scan members list:
    // https://discord.com/api/v9/guilds/713127035156955276/premium/subscriptions

    // Past me was wrong.
    // That returns: `{"message": "Bots cannot use this endpoint", "code": 20001}`
    // I guess *technically* you could hardcode to selfbot this...
    // Relevant: https://github.com/discord/discord-api-docs/issues/1182
    // Relevant: https://github.com/discord/discord-api-docs/discussions/3228

    let gid = msg.d.guild_id;
    let boosters = [...memberMap.get(gid).entries()].map(a=>a[1]).filter(a=>a.premium_since);
    let ct = boosters.length;
    let str = "\\* "+boosters
          .map((a) => {
            let time = timeDuration(new Date(a.premium_since),msg.time)
                .split(/ (?:and )?/)
                .splice(0,4);
            if (time.length==4) time.splice(2,0,"and");
            return (a.nick?a.nick:a.user.username)+"\t\t—\t"+time.join(" ");
          }).join("\n\\* ")
    replyToMessage(msg.d,"**__"+ct+" Booster"+(ct==1?"":"s")+"__**"+(ct==0?"":'\n\n'+str))
  }
}

modules.listModules = {
  name: "listModules",
  onDispatch: (bot,msg) => {
    if (msg.t !== "MESSAGE_CREATE" || !msg.d.guild_id)
      return;
    let command = commandAndPrefix(msg.d.content);
    if (!command)
      return;
    let first = command.shift().toLowerCase()
    if (first !== "listmodules")
      return;
    replyToMessage(msg.d,bot.modules.map(a=>a&&a.name?a.name:"{unknown or removed module}").join("\n"))
  }
}







tempModules = {
  rss: null,
  createThread: null,
  directMessages: null,
  sendPregeneratedMessageSet: null
}

tempModules.rss = {
  name: "rss",
  // lastPubDate: "2021-09-09 08:52:18", // next to last
  lastPubDate: "2021-08-31 23:35:08", // brianna
  lastCheckTime: 0,
  onDispatch: (bot,msg) => {
    if (Date.now() > modules.rss.lastCheckTime+300000) {
      console.log("Checking rss...")
      modules.rss.lastCheckTime = Date.now();
      discordRequest("https://api.rss2json.com/v1/api.json?rss_url=https://wingsoffire.fandom.com/wiki/Special:NewPages?feed=rss",null,null,null,null,false).
        then(a=>modules.rss.response(a))
    }
  },
  response: (a) => {
    console.log("Parsing rss...");
    console.log(a.res);
    if (a.res.length<2000)
      delete a.res;
    console.log(a);
    if (a.ret == 403) {
      console.error("RSS returned Forbidden!");
      if (!modules.rss.hasComplained)
        sendMessage("870500800613470248","Requesting WoF Wiki's recently created pages returned Forbidden!");
      modules.rss.hasComplained = true;
    }

    let wss = JSON.parse(a.res);
    console.log("Parsed rss.");
    let lastPubDate = modules.rss.lastPubDate;
    let messageQueue = [];
    for (let i=0; i<wss.items.length && wss.items[i].pubDate!==lastPubDate; i++) {
      console.log("Checking i="+i);
      let item = wss.items[i];
      let rssEmbed = {
        "title": 'WoF Wikia - New Article Created: '+JSON.stringify(item.title),
        "description": item.description,
        "url": item.link,
        "color": 7441133,
        "fields": [{"name": "Creator", "value": item.author}]
      }
      messageQueue.push({embeds:[rssEmbed]});
    }
    let callback = (i) => {console.log("callback failed.")}
    callback = (i) => {
      if (i>=0)
        sendMessage("870500800613470248",messageQueue[i]);
      if (i>0)
        setTimeout(()=>callback(i-1),1500);
      else
        console.log("callback loop done.")
    }
    callback(messageQueue.length-1);
    console.log("done with loop")
    modules.rss.lastPubDate = wss.items[0].pubDate;
  }
}

tempModules.createThread = {
  name: "temp_createThread",
  onDispatch: (bot,msg) => {
    if (msg.t === "MESSAGE_CREATE" && msg.d.author.id === "163718745888522241"){
      try {
        // let obj = JSON.parse(msg.d.content);
        // console.log(obj);
        if (/^<@870750872504786944> createThread /.test(msg.d.content)) {
          //    {"name":"thread title","type":11,"auto_archive_duration":1440,"location":"Thread Browser Toolbar"}
          // -> https://discord.com/api/v9/channels/870868727820849183/threads
          //    {"name":"thread title","type":11,"auto_archive_duration":1440,"location":"Message"}
          // -> https://discord.com/api/v9/channels/870868727820849183/messages/898691240290291723/threads
          console.log("Thread create request received.")
          // discordRequest()
          discordRequest("channels/"+msg.d.channel_id+"/threads",{name:(msg.d.content.substring("<@870750872504786944> createThread ".length)),type:11,auto_archive_duration:1440});
        }
      } catch (err) {
      }
    }
  }
};

tempModules.directMessages = {
  name: "temp_directMessages",
  onDispatch: (bot,msg) => {
    // check if new message is from dms or not.
    if (msg.t !== "MESSAGE_CREATE")
      return;
    let m = tempModules.directMessages;
    let uid = msg.d.author.id;
    let isDm = !msg.d.guild_id;
    if (isDm && !userDmMap.has(msg.d.channel_id)) {
      discordRequest('channels/'+msg.d.channel_id).then(
        res=>{
          let channel = JSON.parse(res.res)
          channelMap.set(channel.id,channel)
        });
    }

    let command = commandAndPrefix(msg.d.content);
    if (command && command.shift().toLowerCase() == "dmme") {
      if (!userDmMap.has(uid)) {
        discordRequest('users/@me/channels',{"recipient_id":uid}).then(
          res=>{
            let channel = JSON.parse(res.res);
            channelMap.set(channel.id,channel)
            userDmMap.set(uid,channel.id);
            m.sendGreetings(uid);
          });
      } else {
        m.sendGreetings(uid)
      }
    }
  },
  sendGreetings: (uid) => {
    sendMessage(userDmMap.get(uid),"Hello!");
  }
}

tempModules.sendPregeneratedMessageSet = {
  name: "temp_sendPregeneratedMessageSet",
  onDispatch: (bot,msg) => {
    if (msg.t === "MESSAGE_CREATE" && msg.d.author.id === "163718745888522241"){
      if (/^<@870750872504786944> send /.test(msg.d.content)) {
        let fname = msg.d.content.substring("<@870750872504786944> send ".length);
        if (fs.existsSync("sets/"+fname))
          tempModules.sendPregeneratedMessageSet.sendMessageSet(msg.d,JSON.parse(fs.readFileSync("sets/"+fname)).flat(5),[],0);
      }
    }
  },
  sendMessageSet: (dest,messages,responses,index) => {
    messages = messages.flat();
    if (messages[index] == undefined)
      return;

    sendMessage(dest.channel_id, JSON.parse(JSON.stringify(messages[index])
      .replaceAll("{{CID}}",dest.channel_id)
      // Replace {{MID}} with MID of 0th message.
      // Replace {{MID123}} with MID of 123rd message
      .split(/({{MID[0-9]*}})/).map(a=>Number((a.match(/{{MID([0-9]*)}}/)?.at(1)))+.1 || a).map(a=>typeof a === "number"?responses?.at(Math.floor(a))?.id??a:a).join(""))
    )
      .then(a=>
      {
        console.log("Retcode:"+a.ret);
        responses.push(JSON.parse(a.res));
        setTimeout(()=>{tempModules.sendPregeneratedMessageSet.sendMessageSet(dest,messages,responses,index+1)},1500);
        // Todo: Allow reactions to be automatically added. eg: #roles channel default messages.
      });
  }
}

modules.webhookWatch = {
  name: "webhookWatch",
  webhookMap: new Map(), // gid -> {wid: wobj} // to be diffable
  onDispatch: (bot,msg) => {
    let m = modules.webhookWatch;
    if (msg.t === "GUILD_CREATE") {
      let gid = msg.d.id;
      cq.add(cq.medium,()=>discordRequest("guilds/"+gid+"/webhooks")
        .then(a=>{
          _debug_webhooks=a;
          if (a.ret != 200)
            return console.error("Guild webhooks failed to load: "+gid);
          let webhooksLoaded = JSON.parse(a.res);
          m.webhookMap.set(gid,Object.fromEntries(webhooksLoaded.map(a=>[a.id,a]).sort()))
        }));
      cq.attempt();
    }

    // try {
    //   let diffo = getDiffObj(threadMap.get(msg.d.id),msg.d)
    //   let diffs = getDiffsFromDiffObj(diffo)
    //   diffText = []
    //   console.log(diffs)
    //   diffs = diffs.filter(a=>{return modules.threadLogging.threadChangesToIgnore.indexOf(a[1].join("."))==-1})
    //   diffs.forEach(a=>diffText.push(a[1].join('.')+" -> "+diffToText(getWithin(diffo,a[1]))))
    //   diffText = "Attributes changed ("+diffs.length+"): \n> "+diffText.join("\n> ")
    // } catch (e) {console.error("Diff failed:",e)}

    if (msg.t !== "WEBHOOKS_UPDATE")
      return;
    if (Object.keys(msg.d).length==2 && msg.d.guild_id && msg.d.channel_id) {
      let gid = msg.d.guild_id;

      cq.add(cq.medium,()=>discordRequest("guilds/"+gid+"/webhooks").then(res=>{
        let message = {embeds:[{color:5797096,title:"Webhooks Changed",
              description:"A webhook was changed"+(msg.d.channel_id?" in <#"+msg.d.channel_id+">":"")+"."}]}
        let diffText = "Unknown changes. See firework logs."
        let original = m.webhookMap.get(gid);
        let changed = Object.fromEntries(JSON.parse(res.res).map(a=>[a.id,a]).sort())
        try {
          let diffo = getDiffObj(original,changed)
          let diffs = getDiffsFromDiffObj(diffo)
          diffText = []
          diffs = diffs.filter(a=>{return modules.threadLogging.threadChangesToIgnore.indexOf(a[1].join("."))==-1})
          diffs.forEach(a=>diffText.push(a[1].join('.')+" -> "+diffToText(getWithin(diffo,a[1]))))
          diffText = "Attributes changed ("+diffs.length+"): \n> "+diffText.join("\n> ")
        } catch (e) {console.error("Diff failed:",e)}

        message.embeds[0].description+="\n\n"+diffText;

        if (modules.threadLogging.guildThreadLogChannels.has(msg.d.guild_id))
          sendMessage(modules.threadLogging.guildThreadLogChannels.get(msg.d.guild_id),message).then(a=>console.log(a));

        m.webhookMap.set(gid,changed);
      }));
      cq.attempt();
    }
  }
}













// production branch
if (!beta) {
  // bot.addModule(modules.nop) //
  bot.addModule(modules.securityIssue)
  bot.addModule(modules.joinMessages)
  bot.addModule(modules.inviteLogging)
  bot.addModule(modules.disboardReminder)
  bot.addModule(modules.threadLogging)
  bot.addModule(modules.infoHelpUptime)
  bot.addModule(modules.embeds)
  bot.addModule(modules.threadAlive)
  bot.addModule(modules.xp)
  bot.addModule(modules.saveLoad)
  bot.addModule(modules.whois)
  bot.addModule(modules.whatis) // WIP, but mostly done
  bot.addModule(modules.boosters) // kinda broken atm
  bot.addModule(modules.listModules)
  bot.addModule(modules.webhookWatch)

  // bot.addModule(tempModules.rss) //
  // bot.addModule(tempModules.createThread) //
  // bot.addModule(tempModules.directMessages) //
  // bot.addModule(tempModules.sendPregeneratedMessageSet) //

  bot.modulesPre.push(modules.userMemoryPre);
  bot.modulesPost.push(modules.userMemoryPost);
}



// beta branch
if (beta) {
  // bot.addModule(modules.nop) //
  bot.addModule(modules.securityIssue)
  // bot.addModule(modules.joinMessages) //
  bot.addModule(modules.inviteLogging) // required for some logic
  // bot.addModule(modules.disboardReminder) //
  // bot.addModule(modules.threadLogging) //
  // bot.addModule(modules.infoHelpUptime)
  // bot.addModule(modules.embeds)
  // bot.addModule(modules.threadAlive) //
  // bot.addModule(modules.xp) //
  bot.addModule(modules.saveLoad)
  // bot.addModule(modules.whois)
  // bot.addModule(modules.whatis)
  bot.addModule(modules.boosters) // broken atm
  bot.addModule(modules.listModules)
  bot.addModule(modules.webhookWatch) // required for some logic

  // bot.addModule(tempModules.rss) //
  // bot.addModule(tempModules.createThread) //
  bot.addModule(tempModules.directMessages) //
  // bot.addModule(tempModules.sendPregeneratedMessageSet) //

  bot.modulesPre.push(modules.userMemoryPre);
  bot.modulesPost.push(modules.userMemoryPost);
}
console.log("Gateway.js Loaded!")
