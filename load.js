if (!fs)
  throw "Please run this file through a NodeJS Repl: `.load load.js`";

let utilsPath = `${os.homedir()}/bin/util.js`;
if (fs.existsSync(utilsPath))
  eval(String(fs.readFileSync(utilsPath)));
eval(String(fs.readFileSync("load_helpers.js")));

ensureExists(["gateway.js","diff.js"]);
ensureExists(["gateway_data","gateway_static"],"directories");
ensureExists(["gateway_static/token.json","gateway_static/mimetypes.json","gateway_static/badge_emotes.json"]);
eval(String(fs.readFileSync("gateway.js")));
ensureExists([!beta?"contacts":"contactsbeta"],"directory");
eval(String(fs.readFileSync("diff.js")));
incrementVersion();
// Load bot settings.
load();
"Start the bot with `bot.start()`."