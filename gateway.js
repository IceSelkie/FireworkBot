const WebSocket = require("ws").WebSocket;
const https = require("https");
const fs = require("fs");
const identify = {"op":2,"d":{"intents":32767,"properties":{"$os":process.platform,"$browser":"node","$device":"firework"},"token":(JSON.parse(fs.readFileSync("token.json").toString())).token}};
const heartbeatUpdateInterval = 500;
const reconnectInterval = 4000;
const userMap = new Map();


// privilaged intents codes:
//  w/o       w/
// 32509    32767


oldlog = console.log;
console.log= (a) =>{oldlog("["+new Date().toISOString().substring(11,19)+"]",a)}





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
    this.modules = [];
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
  // "Ice Selkie ✿#4064 code the Firework Bot!"
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



  addModule = function(module) {
    this.modules.push(module);
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
        console.log("Discord server load balancing... Reconnecting...");
        thiss.start(thiss.sessionID);
      }
      if (errcode === 1001 && buffer.toString() === "CloudFlare WebSocket proxy restarting") {
        console.log("CloudFlare proxy load balancing... Reconnecting...");
        thiss.start(thiss.sessionID);
      }
      if (errcode === 1006) {
        console.log("Unexpected client side disconnect... Reconnecting in 4 seconds...");
        setTimeout(()=>thiss.start(thiss.sessionID), reconnectInterval);
      }
    });

    this.ws.on('message', function incoming(message) {
      let message_time = Date.now();
      // console.log('recieved:');
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
        thiss.modules.forEach(a => {if (a.onDispatch) a.onDispatch(thiss, message);});
      }
    });
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











discordRequest = function(path, data=null, method="GET") {
  // console.log("Discord Request called with path of:")
  // console.log(path)
  // console.log("Discord Request called with data of:")
  // console.log(data)
  return new Promise((resolve,reject)=>{
    if (method==="GET"&&data!==null)
      method = "POST";
    let opts = {"hostname": "discord.com","port": 443,"headers":{"content-type":"application/json","authorization":identify.d.token},
      "path": (path.includes("https://")?path:"/api/v9/"+path),
      "method": method
    }
    console.log(JSON.stringify({method:opts.method,path:opts.path,data:JSON.stringify(data)}));
    let req = https.request(opts,
      res=>{
        let data = '';
        res.setEncoding('utf8');
        // console.log('Headers:\n'+JSON.stringify(res.headers,null,2));
        res.on('data',part=>data+=part);
        // TODO: send ratelimit data
        res.on('end',()=>resolve({"ret":res.statusCode,"res":data,"ratelimit_data":null}));
      }).on('error',err=>reject(err));
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





modules = {
  userMemory: null,
  joinMessages: null,
  pingLogin: null
}

modules.userMemory = {
  onDispatch: (bot,msg)=>{
    if (msg.t === "GUILD_CREATE") {
      msg.d.members.forEach(a=>{
        if (!userMap.has(a.user.id)) {
          userMap.set(a.user.id,a.user);
        }
      })
    }
  }
}

modules.joinMessages = {
  postChannel: ["870500800613470248","870868727820849183"],
  messages: ['{USER} is here to kick butt and chew scavenger! And {USER} is all out of scavenger.',
             'Please welcome {USER} to Pyrrhia!',
             'Please welcome {USER} to Pantala!',
             "Welcome to the dragon's den, {USER}!",
             'Welcome, {USER}! We wish you the power of the wings of fire!',
             'The __Eye of Onyx__ fortold that _The One_ is coming! And now here is {USER}! Maybe {USER} is _The One_...?',
             '{USER} is here. Did they bring snacks?',
             '{USER} is here now. Will this keep Darkstalker away?'],
  genJoinMessage: u=> "<@"+u.id+"> has joined the server.\n> "+modules.joinMessages.messages[Math.floor(Math.random() * modules.joinMessages.messages.length)].replace(/\{USER\}/g,"**"+u.username+"**").replace(/\{PING\}/g,"<@"+u.id+">"),
  onDispatch: (bot,msg) => {
    if (msg.t === "GUILD_MEMBER_ADD") {

      let user = msg.d.user; // {username,public_flags,id,discriminator,avatar}
      let message = {content: modules.joinMessages.genJoinMessage(user)};

      sendMessage(modules.joinMessages.postChannel,message).then(a=>console.log(a));

    }
  }
}

modules.inviteLogging = {
  inviteMap: new Map(),
  inviteLoggingChannel: "750509276707160126",
  onDispatch: (bot,msg) => {
    let map = modules.inviteLogging.inviteMap;
    if (msg.t === "INVITE_CREATE")
      sendMessage(modules.inviteLogging.inviteLoggingChannel,{
        embeds:[{color:5797096,title:"Invite Created",
          description:"<@"+msg.d.inviter.id+"> created invite code `"+msg.d.code+"` for <#"+msg.d.channel_id+">."
            +'\n\n'+(msg.d.max_uses===0?"∞":msg.d.max_uses)+" uses"
            +" • "
            +"expires "+(msg.d.max_age==0?"never":"<t:"+(Math.floor(msg.time/1000)+msg.d.max_age)+":R>")+"."
        }]
      });
    if (msg.t === "INVITE_DELETE") {
      sendMessage(modules.inviteLogging.inviteLoggingChannel,{
        embeds:[{color:5797096,title:"Invite Deleted",
          description:"<@"+map.get(msg.d.code).user.id+">'s invite code `"+msg.d.code+"` for <#"+msg.d.channel_id+"> was deleted."
                    +'\n\n'+map.get(msg.d.code).uses+'/'+(map.get(msg.d.code).max_uses===0?"∞":map.get(msg.d.code).max_uses)+" uses"
                    +" • "
                    +"expires "+(map.get(msg.d.code).max_age==0?"never":"<t:"+(Math.floor(map.get(msg.d.code).time/1000)+map.get(msg.d.code).max_age)+":R>")+"."
        }]
      });
      map.delete(msg.d.code);
    }
    let invites_promise;
    if (msg.t === "GUILD_MEMBER_ADD") {
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
          if (candidates.length === 0)
            sendMessage(modules.inviteLogging.inviteLoggingChannel,{embeds:[{color:5797096,title:"Invite Used",
              description:"<@"+msg.d.user.id+"> joined the server... But no invite code was found to have been used...?"}]});
          else if (candidates.length > 10) {
            sendMessage(modules.inviteLogging.inviteLoggingChannel,{embeds:[{color:5797096,title:"Invite Used",
              description:"<@"+msg.d.user.id+"> joined the server... But more than 10 possible invites were found to have been used...?"}]});
          } else {
            let message_object = {embeds:[]}
            for (let i=0; i<candidates.length; i++)
              message_object.embeds.push(
                {color:5797096,title:"Invite Used",
                  description:"<@"+msg.d.user.id+"> used invite code `"+candidates[i].code+"` by <@"+candidates[i].inviter_id+">!"
                    +'\n\n'+candidates[i].uses+'/'+(candidates[i].max_uses===0?"∞":candidates[i].max_uses)+" uses"
                    +" • "
                    +"expires "+(candidates[i].max_age==0?"never":"<t:"+(Math.floor(candidates[i].time/1000)+candidates[i].max_age)+":R>")+"."
                }
              );
            sendMessage(modules.inviteLogging.inviteLoggingChannel,message_object).then(a=>console.log(a));
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

bot.addModule(modules.userMemory)
bot.addModule(modules.joinMessages)
bot.addModule(modules.inviteLogging)





