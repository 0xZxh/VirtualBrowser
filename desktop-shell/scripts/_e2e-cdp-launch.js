const WebSocket = require("ws");
const http = require("http");

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}

(async () => {
  const tabs = await getJson("http://127.0.0.1:9222/json");
  const page = tabs.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  function send(method, params = {}) {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });

  const evalExpr = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return r.result;
  };

  // Prefer native IPC launch via chrome.send if available
  const launchViaNative = await evalExpr(`(async () => {
    return await new Promise((resolve) => {
      const cb = "e2eLaunchCb_" + Date.now();
      window[cb] = function(status, data) {
        resolve({ via: "chrome.send", status, data });
        try { delete window[cb]; } catch(e) {}
      };
      try {
        if (!window.chrome || !window.chrome.send) {
          resolve({ via: "chrome.send", error: "no chrome.send" });
          return;
        }
        // native launchBrowser typically: chrome.send('launchBrowser', [callback, envId])
        window.chrome.send("launchBrowser", [cb, 1]);
        setTimeout(() => resolve({ via: "chrome.send", error: "timeout 45s" }), 45000);
      } catch (e) {
        resolve({ via: "chrome.send", error: String(e) });
      }
    });
  })()`);
  console.log("launchNative=" + JSON.stringify(launchViaNative.value));

  // Check fingerprint windows after launch
  await new Promise(r => setTimeout(r, 3000));
  const procs = await evalExpr(`({ runningHint: document.body.innerText.includes("运行") })`);
  console.log("after=" + JSON.stringify(procs.value));

  ws.close();
})().catch(e => { console.error("FAIL", e); process.exit(1); });
