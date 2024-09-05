eval(""+fs.readFileSync("gateway.js")) ; null
eval(""+fs.readFileSync("diff.js")) ; null
load();
go=va=>{
  version+=va;
  bot.start();
}