function ensureExists(files=[],fileOrDirectory="files") {
  let missing = files.map(a=>[a,fs.existsSync(a)]).filter(a=>!a[1]).map(a=>a[0]);
  if (missing.length>0)
    throw `Missing ${fileOrDirectory}: [${missing.map(a=>JSON.stringify(a)).join(", ")}]`;
}
function incrementVersion() {
  let curMajor = version;
  let curMinor = null;
  try {
    let lastRun = JSON.parse(fs.readFileSync("gateway_data/lastrun.json"));
    if (curMajor === lastRun.major)
      curMinor = lastRun.minor++;
  } catch (e) {};
  if (isNaN(curMinor) || !(0<curMinor) || curMinor%1 != 0)
    curMinor = 1;
  try {
    fs.writeFile("gateway_data/lastrun.json",JSON.stringify({major:curMajor,minor:curMinor}));
  } catch (e) {};
  version = curMajor+curMinor;
}