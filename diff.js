// enum DifferenceType IDENTICAL,LEFT,RIGHT,DIFF_PRIM,DIFF_OBJ;
ID = "IDENTICAL"
LF = "LEFT"
RT = "RIGHT"
DP = "DIFF_PRIM"
DO = "DIFF_OBJ"


getDiffs = null            // a,b -> [[difftype, depthkey], ...]
getDiffsFromDiffObj = null // diffobj -> [[difftype, depthkey], ...]
getDiffObj = null          // a,b -> diffobj

getWithin = null           // a,[k1,...,kn] -> a[k1][...][kn]
diffToText = null          // [difftype, left, (right)] -> "Changed from L to R"


function getDiffObj(a,b) {
  // Primitives case (either is primitive)
  if (isPrimitive(a) || isPrimitive(b))
    return (a===b)?[ID,a]:[DP,a,b]

  // Arrays case
  let arr = (isArray(a)?2:0) + (isArray(b)?1:0)
  if (arr === 3)
    return getDiffArr(a,b)
  else if (arr !== 0)
    return [DP,a,b]

  let ak = keys(a)
  let bk = keys(b)
  let ks = uniq([ak,bk].flat()).sort()
  let ret = {}
  for (const k of ks) {
    if ((k in a) && (k in b))
      ret[k] = getDiffObj(a[k],b[k])
    else if (k in a)
      ret[k] = [LF,a[k]]
    else
      ret[k] = [RT,b[k]]
  }
  return ret
}

function getDiffArr(a,b) {
  let ret = []
  let lmin = Math.min(a.length, b.length)
  for (i=0; i<lmin; i++)
    ret.push(getDiffObj(a[i],b[i]))
  if (a.length>b.length)
    for (i=lmin; i<a.length; i++)
      ret.push([LF,a[i]])
  if (b.length>a.length)
    for (i=lmin; i<b.length; i++)
      ret.push([RT,b[i]])
  return ret
}

function getDiffs(a,b) {
  diffo = getDiffObj(a,b)
  return getDiffsFromDiffObj(diffo)
}
function getDiffsFromDiffObj(diffo, prefix=[]) {
  let ret = []
  if ((typeof diffo[0]) === 'string') {
    if (diffo[0] !== ID)
      ret.push([diffo[0],prefix])
    // console.log("new obj: ",ret)
    return ret
  }

  let ks = keys(diffo)
  for (const k of ks) {
    let p = Array.from(prefix)
    p.push(k)
    let rs = getDiffsFromDiffObj(diffo[k],p)
    // console.log("rs is ",rs)
    for (const r of rs) {
      // console.log("adding: ", r)
      if (r.length>0)
        ret.push(r)
      // console.log("arr now: ", ret)
    }
  }
  return ret
}

function keys(o) {
  if (("keys" in o) && (typeof o.keys === "function"))
    return o.keys()
  return Object.keys(o).sort()
}

function isPrimitive(o) {
  return o === null || o === undefined ||
         (typeof o) === "string" || (typeof o) === "number" ||
         (typeof o) === "bigint" || (typeof o) === "boolean" ||
         (typeof o) === "function";
}

function isArray(o) {
  return (o instanceof Array)
}

// From https://stackoverflow.com/a/14438954
function uniq(arr) {
  return [...new Set(arr)]
}


function getWithin(obj, indicies) {
  for (const key of indicies)
    obj = obj[key]
  return obj
}

function diffToText(diffp) {
  if (diffp[0] === ID) return "Property Unchanged: "+JSON.stringify(diffp[1])
  if (diffp[0] === LF) return "Property Removed: "+JSON.stringify(diffp[1])
  if (diffp[0] === RT) return "Property Added: "+JSON.stringify(diffp[1])
  if (diffp[0] === DP) return "Property Changed: "+JSON.stringify(diffp[1])+" -> "+JSON.stringify(diffp[2])
  if (diffp[0] === DO) return "Property Changed: "+JSON.stringify(diffp[1])+" -> "+JSON.stringify(diffp[2])
}

passing = true
obj1 = {a:"hello",b:"hoot?",c:"text!",e:"diffcode"}
obj2 = {a:"hello",          d:"text!",e:"morecode"}
arr1 = [0,1, "2",3n,7]
arr2 = [0,1n,"2",3n,4,5,6]
function tests() {
  assertEquals = function(expected,actual) {
    if (expected!==actual) {
      console.error("Assertion failed. Expected: "+JSON.stringify(expected)+" got "+JSON.stringify(actual)+" instead.")
      passing = false
    }
  }
  // Test getWithin
  assertEquals("hi",getWithin({a:{b:"hi"}},["a","b"]))
  assertEquals(undefined,getWithin({a:{b:"hi"}},["a","c"]))

  // Primative comparisons
  assertEquals(ID, getDiffObj("obj1","obj1")[0])
  assertEquals(DP, getDiffObj("",false)[0])
  assertEquals(DP, getDiffObj("",{})[0])
  assertEquals(DP, getDiffObj({},false)[0])
  assertEquals(DP, getDiffObj(0,0n)[0])

  // Object comparisons
  assertEquals(ID, getDiffObj(obj1,obj2).a[0])
  assertEquals(LF, getDiffObj(obj1,obj2).b[0])
  assertEquals(RT, getDiffObj(obj1,obj2).d[0])
  assertEquals(DP, getDiffObj(obj1,obj2).e[0])

  assertEquals(DP, getWithin(getDiffs(obj1,obj2),[3,0]))
}
tests() ; if (passing) console.log("[Object Diff] Unit Tests Passed!"); else console.error("[Object Diff] Unit Tests Failed!")
