const WebSocket = require("ws").WebSocket;
const https = require("https");
const fs = require("fs");
const identify = {"op":2,"d":{"intents":32767,"properties":{"$os":process.platform,"$browser":"node","$device":"firework"},"token":(JSON.parse(fs.readFileSync("token.json").toString())).token}};
const heartbeatUpdateInterval = 500;
const reconnectInterval = 4000;
const userMap = new Map();    // user_id -> user_obj
const memberMap = new Map();  // guild_id -> map<member_id,members> (contains roles+nick+boost+mute)
const channelMap = new Map();
const guildNameMap = new Map(); // guild_id -> string
const rolePositions = new Map();
var sents = []
beta = true;
version = "v0.13.1"+(beta?" beta":"")


// privilaged intents codes:
//  w/o       w/
// 32509    32767


const dispatchTypes = [  // GUILDS (1 << 0)
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


oldlog = console.log;
console.log= (a,b,c,d) =>{
  if (d!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b,c,d);
  else if (c!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b,c);
  else if (b!==undefined) oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a,b);
  else oldlog("INF["+new Date().toISOString().substring(11,19)+"]",a);}
olderr = console.error;
console.error= (a) =>{olderr("ERR["+new Date().toISOString().substring(11,19)+"]",a)}





class Bot {
  constructor() {
    this.ws = null;
    this.lastSequence = null;
    this.lastHeartbeat = 0;
    this.heartbeatShouldBeRunning = false;
    this.types = new Map();
    this.contacts = [];
    // var sents = []; // global cuz refactoring is pain
    this.print = false; // print all dispatch to logs
    // this.send = true; // false to disable sending messages via sendMessage method
    // this.heartbeatThread = 0;
    this.connectionAlive = false;
    this.interval = null;
    this.sessionID = null;
    this.self = null; // the user object for this bot.
    this.modules = [];
    this.plannedMessages = []; // heap of messages to be sent; tags of when to send and if late messages okay.
    this.timeStart = Date.now();
    this.timeLastReconnect = null;

    try {
      let data = fs.readFileSync("firework_config.json").toString();
      data = JSON.parse(data);
      this.config = data;
    } catch (err) {}
    try {
      let data = fs.readFileSync("firework_plannedactions.json").toString();
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
      console.log("Recieved message (none/heartbeat-ack)");
      console.log(message)
    }
    if (message.s!=null) {
      while (thiss.contacts.length<message.s-1)
        thiss.contacts.push(null);
      thiss.contacts[message.s-1] = message;
      // console.log("Recieved message #"+message.s + hasInterest(messagestr));
      thiss.lastSequence = message.s;
    }

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

      thiss.modules.forEach(a => {
        try {
          if (a.onDispatch) a.onDispatch(thiss, message);
        } catch (err) {
          console.error(err);
          sendMessage("883172908418084954",err.toString())
        }
      });
    }
  }

  cleanup = function() {
    oldlog(timeDuration(this.timeStart,this.contacts[this.contacts.length-1].time));
    oldlog(new Date(this.contacts[this.contacts.length-1].time));
    oldlog(this.contacts.length/1000);
    fs.writeFileSync("contacts"+(beta?"beta/":"/")+this.contacts[0].time+"-"+this.contacts.length+".json",JSON.stringify(this.contacts));
    fs.writeFileSync("contacts"+(beta?"beta/":"/")+this.contacts[0].time+"-"+this.contacts.length+"-sents.json",JSON.stringify(sents));
    oldlog(version);
  }


  g = function(s) {
    console.log(JSON.stringify(this.contacts[s-1],null,2));
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
bot = new Bot();











discordRequest = function(path, data=null, method="GET", useToken=true) {
  // console.log("Discord Request called with path of:")
  // console.log(path)
  // console.log("Discord Request called with data of:")
  // console.log(data)
  return new Promise((resolve,reject)=>{
    if (method == null)
      method = "GET";
    if (method==="GET"&&data!==null)
      method = "POST";
    let headers = {"content-type":"application/json"};
    if (useToken)
      headers.authorization=identify.d.token;
    let opts = {"hostname": "discord.com","port": 443,"headers":headers,
      "path": (path.includes("https://")?path:"/api/v9/"+path),
      "method": method
    }
    if (typeof data !== "string")
      data = JSON.stringify(data);
    
    saveObject = {
      method:opts.method,
      path:opts.path,
      data:data,
      timeSend:Date.now()
    };
    sents.push(saveObject);
    console.log(JSON.stringify(saveObject));

    let req = https.request(opts,
      res=>{
        let data = '';
        res.setEncoding('utf8');
        // console.log('Headers:\n'+JSON.stringify(res.headers,null,2));
        res.on('data',part=>data+=part);
        // TODO: remember ratelimit data
        res.on('end',()=>{
          saveObject.timeDone = Date.now();
          saveObject.ret = res.statusCode;
          saveObject.res = data;
          saveObject.ratelimit_data = JSON.stringify(res.headers,null,2);
          resolve(saveObject);
        });
      }).on('error',err=>{
        saveObject.timeDone = Date.now();
        saveObject.err = err;
        reject(err);
      });
    if (data !== null) {
      if (typeof data !== 'string')
        data = JSON.stringify(data,null);
      req.write(data);
    }
    req.end();
  });
}
sendMessage = async function(channel_id, message_object) {
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
  else
    return discordRequest("channels/"+channel_id+"/messages",JSON.stringify(message_object));
}

replyToMessage = async function(original, message_object) {
  if (typeof message_object === "string")
    message_object = {"content":message_object};
  message_object.message_reference = {channel_id:original.channel_id, message_id:original.id};
  return sendMessage(original.channel_id,message_object);
}

timeDuration = function(start, end, depth=2, descriptors) {
  // if (start==null)
  //   return null;
  // if (descriptors==null || !(descriptors instanceof Array))
  //   descriptors = [['ms',1000],['s',60],['m',60],['hr',24],['d']];
  // if (depth==null)
  //   depth = 2;

  // let duration = start;
  // if (end!=null)
  //   duration = end-start;

  // if (duration==0)
  //   return "0ms";
  // let ret = duration<0?"-":"";
  // duration = duration<0?-duration:duration;

  // //
  // let stack = [];
  // for (let i = 0; i < descriptors.length-1; i++) {
  //   console.log(stack);
  //   if (descriptors[i] == null || !(descriptors[i] instanceof Array) || descriptors[i].length<2) {
  //     console.log("invalid entry")
  //     stack.push(null);
  //     continue;
  //   }
  //   if (descriptors[i][0] == null) {
  //     console.log("scale ratio with no name")
  //     stack.push(null);
  //     duration /= descriptors[i][1];
  //     continue;
  //   }
  //   console.log("actual thing")
  //   stack.push(duration%descriptors[i][1]);
  //   duration = Math.floor(duration/descriptors[i][1])
  // }
  // if (duration!=0)
  // stack.push(duration);
  // console.log(stack);
  // for (let i = stack.length-1; i >= 0 && depth > 0; i--) {
  //   console.log("attempt "+i)
  //   if (stack[i] == null)
  //     continue;
  //   if (i==0 || stack[i]!=0) {
  //    ret += stack[i] + descriptors[i][0];
  //     depth--;
  //   }
  //   console.log(ret,depth);
  // }

  // return ret;
  if (start==null)
    return null;
  if (depth==null)
    depth = 999;

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
  if (ret2.length>=3) // empty/negative
    ret2[ret2.length-2].push("and");
  return ret2.flat().join(" ");
}

snowflakeToTime = function(snowflake) {
  return Number(BigInt(snowflake)/4194304n+1420070400000n);
}




modules = {
  nop: null,
  incrementalLog: null,
  userMemory: null,
  joinMessages: null,
  inviteLogging: null,
  disboardReminder: null,
  threadLogging: null,
  infoHelpUptime: null,
  embeds: null
}

modules.nop = {
  name: "nop",
  onDispatch: (bot,msg)=>{}
}
modules.incrementalLog = {
  name: "incrementalLog",
  onDispatch: (bot,msg)=>{
    fs.appendFileSync("contacts"+(beta?"beta/":"/")+"latest.log",JSON.stringify(msg)+'\n')
  }
}
modules.userMemory = {
  name: "userMemory",
  onDispatch: (bot,msg)=>{
    if (msg.t === "GUILD_CREATE") {
      guildNameMap.set(msg.d.id,msg.d.name)
      msg.d.members.forEach(a=>{
        if (!userMap.has(a.user.id)) {
          userMap.set(a.user.id,a.user);
        }
      })
      if (!memberMap.has(msg.d.id))
        memberMap.set(msg.d.id,new Map());
      msg.d.members.forEach(member=>modules.userMemory.mergeMember(msg.d.id,member.user.id,member));
      msg.d.roles.forEach(role=>rolePositions.set(role.id,role.position));
      msg.d.channels.forEach(channel=>channelMap.set(channel.id,channel));
    }
    if (msg.t === "GUILD_UPDATE") {
      guildNameMap.set(msg.d.id,msg.d.name)
    }
    if (msg.t === "USER_UPDATE") {
      userMap.set(msg.user.id,msg.user);
    }
    if (msg.t === "GUILD_MEMBER_ADD" || msg.t === "GUILD_MEMBER_UPDATE") {
      let member = JSON.parse(JSON.stringify(msg.d));
      let guild_id = member.guild_id;
      modules.userMemory.mergeMember(guild_id,member.user.id,member);
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
modules.guildMemory = {
  name: "guildMemory",
  types: dispatchTypes.filter(t=>t.includes("GUILD")),
  onDispatch: (bot,msg) => {
    if (types.includes(msg.t)) {
      let action = 'unknown';
      if      (msg.t.includes('CREATE') || msg.t.includes('ADD')   )  action = 'create';
      else if (msg.t.includes('UPDATE')                            )  action = 'update';
      else if (msg.t.includes('DELETE') || msg.t.includes('REMOVE'))  action = 'remove';
      let area = 'guild';
      if      (msg.t.startsWith('GUILD_BAN'            )) area = 'bans';
      else if (msg.t.startsWith('GUILD_ROLE'           )) area = 'roles';
      else if (msg.t.startsWith('GUILD_MEMBER'         )) area = 'members';
      else if (msg.t.startsWith('GUILD_EMOJIS'         )) area = 'emojis';
      else if (msg.t.startsWith('GUILD_STICKERS'       )) area = 'stickers';
      else if (msg.t.startsWith('GUILD_INTEGRATIONS'   )) area = 'integrations';
      else if (msg.t.startsWith('GUILD_SCHEDULED_EVENT')) area = 'event';
    }
  }
}

modules.joinMessages = {
  name: "joinMessages",

  postChannel: ["870868727820849183","883172908418084954"],
  guildJoinChannels: new Map([["713127035156955276","713444513833680909"], //wofcs
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
                 '{USER} has risen from the under a mountain! Hopefully {USER} isn\'t Darkstalker...',
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
            name: "A new FanWing has arrived!",
            icon_url: "https://cdn.discordapp.com/avatars/"+user.id+"/"+user.avatar+".png?size=256"
          },
          description: modules.joinMessages.genJoinMessage(user),
          fields: [{name: "Username",value: user.username+"#"+user.discriminator+" • <@"+user.id+">"},
            {name:"Account Age",value: timeDuration(snowflakeToTime(user.id), msg.time,999)}],
          footer: {text:user.id}
        }]};
      if (modules.joinMessages.guildJoinChannels.has(guild))
        sendMessage(modules.joinMessages.guildJoinChannels.get(guild),message).then(a=>console.log(a));
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
          fields: [{name: "Username",value: user.username+"#"+user.discriminator+" • <@"+user.id+">"},
            {name:"Time On Server",value: timeDuration(Date.parse(member.joined_at),msg.time,999)},
            {name:"Roles",value: member.roles.length==0?"none":"<@&"+member.roles.join("> <@&")+">"}],
          footer: {text:user.id}
        }]};
      if (modules.joinMessages.guildJoinChannels.has(guild))
        sendMessage(modules.joinMessages.guildJoinChannels.get(guild),message).then(a=>console.log(a));
    }
  }
}


modules.inviteLogging = {
  name: "inviteLogging",
  inviteMap: new Map(),
  inviteLoggingChannel: "750509276707160126",
  guildInviteLogChannels: new Map([["713127035156955276","750509276707160126"], //wofcs
                              ]),
  onDispatch: (bot,msg) => {
    let map = modules.inviteLogging.inviteMap;
    if (msg.t === "INVITE_CREATE"){
      guild = msg.d.guild_id;
      message = {
        embeds:[{color:5797096,title:"Invite Created",
          description:"<@"+msg.d.inviter.id+"> created invite code `"+msg.d.code+"` for <#"+msg.d.channel_id+">."
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
          description:"<@"+map.get(msg.d.code).user.id+">'s invite code `"+msg.d.code+"` for <#"+msg.d.channel_id+"> was deleted."
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
                candidates.push({code:a.code,uses:a.uses,max_uses:a.max_uses,max_age:a.max_age,time:Date.parse(a.created_at),inviter_id:a.inviter.id});
            });
          console.log("Candidate Invite Links:");
          console.log(candidates);
          let message_object = {embeds:[]}
          if (candidates.length === 0)
            message_object.embeds.push({embeds:[{color:5797096,title:"Invite Used",
              description:"<@"+msg.d.user.id+"> joined the server... But no invite code was found to have been used...?"}]});
          else if (candidates.length > 10) {
            message_object.embeds.push({embeds:[{color:5797096,title:"Invite Used",
              description:"<@"+msg.d.user.id+"> joined the server... But more than 10 possible invites were found to have been used...?"}]});
          } else {
            for (let i=0; i<candidates.length; i++)
              message_object.embeds.push(
                {color:5797096,title:"Invite Used",
                  description:"<@"+msg.d.user.id+"> used invite code `"+candidates[i].code+"` by <@"+candidates[i].inviter_id+">!"
                    +'\n\n'+candidates[i].uses+'/'+(candidates[i].max_uses===0?"∞":candidates[i].max_uses)+" uses"
                    +" • "
                    +"expires "+(candidates[i].max_age==0?"never":"<t:"+(Math.floor(candidates[i].time/1000)+candidates[i].max_age)+":R>")+"."
                }
              );
            if (modules.inviteLogging.guildInviteLogChannels.has(guild))
              sendMessage(modules.inviteLogging.guildInviteLogChannels.get(guild),message_object).then(a=>console.log(a));
          }
        });
    }

    let gid;
    if (msg.t === "GUILD_CREATE") gid = msg.d.id;
    if (msg.t === "INVITE_CREATE") gid = msg.d.guild_id;

    if (msg.t === "GUILD_CREATE" || msg.t === "INVITE_CREATE")
      invites_promise=discordRequest("guilds/"+gid+"/invites");

    // Update invites cache.
    if (msg.t === "GUILD_CREATE" || msg.t === "INVITE_CREATE" || msg.t === "GUILD_MEMBER_ADD") {
      invites_promise.then(
        response => {
          let invites = JSON.parse(response.res);
          if (invites.message && invites.code && invites.code === 50013) {
            console.log("No perms to view invites for this guild. Skipping.")
          } else {
            invites.forEach(
              a=>{
                map.set(a.code,
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
        });
    }
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
          sendMessage("870868315793391686",{embeds:[{description:"A [bump]("+bumpLink+") was just done in {GUILD_NAME} by {REGEX.GROUPS[1]}"}]});
          setTimeout(()=>sendMessage(msg.d.channel_id,{embeds:[{description:"A bump was last done 1 hour and 59 minutes ago [up here]("+bumpLink+")."}]}),2*60*60*1000-60*1000);
          setTimeout(()=>sendMessage("870868315793391686",{embeds:[{description:"A bump was last done 1 hour and 59 minutes ago [here]("+bumpLink+")."}]}),2*60*60*1000-60*1000);
          setTimeout(()=>sendMessage("870868315793391686","A new bump can now be done."),2*60*60*1000);
        }
      }
    }
  }
}

modules.threadLogging = {
  name: "threadLogging",
  onDispatch: (bot, msg) => {
    if (msg.t === "THREAD_CREATE") {
      sendMessage("750509276707160126",{embeds:[{color:5797096,title:"Thread Created",
              description:"<#"+msg.d.id+"> was created in <#"+msg.d.parent_id+">.\n\nThread by <@"+msg.d.owner_id+">."}]});
    }
    if (msg.t === "THREAD_DELETE") {
      sendMessage("750509276707160126",{embeds:[{color:5797096,title:"Thread THREAD_DELETE",
              description:"<#"+msg.d.id+"> was created in <#"+msg.d.parent_id+">.\n\nSee server audit logs for more information."}]});
    }
    if (msg.t === "THREAD_UPDATE") {
      sendMessage("750509276707160126",{embeds:[{color:5797096,title:"Thread Modified",
              description:"<#"+msg.d.id+"> in <#"+msg.d.parent_id+"> was modified in some way."
              +"\n(This could be title change, or the thread getting archived!)"
              +"\n\nThread originally by <@"+msg.d.owner_id+">."}]});
    }
    if (msg.t === "GUILD_UPDATE") {
      sendMessage("750509276707160126",{embeds:[{color:5797096,title:"Server Modified",
              description:"The server was modified in some way."
              +"\n(This could be rename, server icon change, owner change, or similar!)"}]});
    }
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
        if (/^(?: uptime| online| stats?| info)$/i.test(message)) {
          let now = Date.now();
          let online = timeDuration(bot.timeStart, now);
          let reconnect = timeDuration(bot.timeLastReconnect, now);
          let reconnect_count = bot.types.get("RESUMED");
          reconnect_count = reconnect_count+(reconnect_count===1?" time":" times");
          reconnect = (reconnect==null)?"never":reconnect+" ago";
          replyToMessage(msg.d,"Firework bot ("+version+")\n"
            +"> "+"Shard count: "+1+"\n"
            +"> "+"Received: "+bot.contacts.length+" packets\n"
            +"> "+"Sent: "+sents.length+" packets\n"
            +"> "+"Seen: "+bot.types.get("MESSAGE_CREATE")+" messages\n"
            +"> "+"Online for: "+online+"\n"
            //+"> "+"Reconnected: "+reconnect_count+"\n"
            +"> "+"Last reconnect: "+reconnect);
        }
        if (/^(?: help)$/i.test(message)) {
          replyToMessage(msg.d,"Firework bot ("+version+")\n"
            +"> "+"Commands:\n"
            +"> "+" • `help  ` - displays this\n"
            +"> "+" • `prefix` - the prefix (`@"+bot.self.username+"#"+bot.self.discriminator+"` or `<@"+bot.self.id+">`)\n"
            +"> "+" • `stats ` - displays uptime and other basic statistics\n")
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
      if ((msg.d.member && msg.d.member.roles.includes("724461190897729596")) || msg.d.author.id === "163718745888522241") {
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
    // Keep threads alive by keeping a list of which threads to keep alive, 
    // then sending a "reset-thread-auto-archive-time" post to discord each
    // 20 hours or so to keep the thread alive.
    if (msg.t === "GUILD_CREATE" && msg.d.threads)
      msg.d.threads.forEach(a=>modules.threadAlive.threads.set(a.id,a));
    if (msg.t === "THREAD_UPDATE" || msg.t === "THREAD_CREATE")
      modules.threadAlive.threads.set(msg.d.id,msg.d);
    if (msg.t === "THREAD_DELETE")
      modules.threadAlive.threads.delete(msg.d.id);
    if (modules.threadAlive.threadAlive == null) {
      load()
      if (!config.threadAlive)
        config.threadAlive = ["865472395468341249","870412032594309140","870973611597500466","872489560339259392","873029741786038273","873187457066237993","873847355814838292","874103479910670406","881228174208413696"];
      save()
      // Read thread-keep-alive-list in from configs.
      config.threadAlive.forEach(
        a=>{
          if (!modules.threadAlive.threads.has(a))
            modules.threadAlive.keepThreadAlive(a);
        });
    }
    // Date.parse(thread.archive_timestamp)
  },
  // Duration 1440 is 1 day for non-boosted servers
  // Duration 4320 is 3 days for tier 1 boosted servers
  // Duration 10080 is 7 days for tier 2 boosted servers
  keepThreadAlive: (channel_id, duration = 1440) => {
    discordRequest("https://discord.com/api/v9/channels/"+channel_id,{"archived":false,"locked":false,"auto_archive_duration":duration},"PATCH");
  }
}

tempModules = {}
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
tempModules.acceptDirectMessage = {
  name: "temp_acceptDirectMessage",
  onDispatch: (bot,msg) => {
    // check if new message is from dms or not.
  }
}
tempModules.securityIssue = {
  name: "temp_securityIssue",
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
tempModules.genRules = {
  name: "genRules",
  onDispatch: (bot,msg) => {
    if (msg.t === "MESSAGE_CREATE" && msg.d.author.id === "163718745888522241"){
      if (/^<@870750872504786944> send /.test(msg.d.content)) {
        let fname = msg.d.content.substring("<@870750872504786944> send ".length);
        if (fs.existsSync("sets/"+fname))
          tempModules.genRules.sendMessageSet(msg.d,JSON.parse(fs.readFileSync("sets/"+fname)).flat(5),[],0);
      }
    }
  },
  sendMessageSet: (dest,messages,responses,index) => {
    messages = messages.flat();
    if (index>messages.length)
      return;

    sendMessage(dest.channel_id, JSON.parse(JSON.stringify(messages[index]).replace("{{CID}}",dest.channel_id).replace("{{MID}}",responses[0]?responses[0].id:"undefined")))
      .then(a=>
      {
        console.log(a);
        responses.push(JSON.parse(a.res));
        setTimeout(()=>{tempModules.genRules.sendMessageSet(dest,messages,responses,index+1)},1500);
      });
  }
}










// production branch
if (!beta) {
  bot.addModule(modules.incrementalLog)
  bot.addModule(modules.userMemory)
  bot.addModule(modules.joinMessages)
  bot.addModule(modules.inviteLogging)
  bot.addModule(modules.disboardReminder)
  bot.addModule(modules.threadLogging)
  bot.addModule(modules.infoHelpUptime)
  bot.addModule(modules.embeds)

  // bot.addModule(tempModules.createThread)
  bot.addModule(tempModules.securityIssue)
  // bot.addModule(tempModules.genRules)
}



// beta branch
if (beta) {
  bot.addModule(modules.incrementalLog)
  bot.addModule(modules.userMemory)
  // bot.addModule(modules.joinMessages)
  // bot.addModule(modules.inviteLogging)
  // bot.addModule(modules.disboardReminder)
  // bot.addModule(modules.threadLogging)
  bot.addModule(modules.infoHelpUptime)
  // bot.addModule(modules.embeds)

  bot.addModule(tempModules.createThread)
  bot.addModule(tempModules.securityIssue)
  bot.addModule(tempModules.genRules)
}
