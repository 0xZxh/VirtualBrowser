/**
 * 京东到家门店后台抓取：优先 CDP 拦截 XHR，DOM / Runtime.evaluate 兜底。
 */
const cdpNavigate = require('./cdp-navigate')
const selectors = require('./jddj-selectors')
const { extractShopIdFromPayload } = require('./jddj-shop-id')
const { logNative, warnNative } = require('./file-logger')

function emptyResult(partial = {}) {
  return {
    shopName: null,
    shopId: null,
    shopIdSource: null,
    businessStatus: '未知',
    orders: [],
    fetchedAt: new Date().toISOString(),
    ok: false,
    error: null,
    ...partial
  }
}

function logScrapeResult(result, extra = {}) {
  const meta = {
    runId: extra.runId || null,
    envId: extra.envId || null,
    hasShopId: !!(result && result.shopId),
    shopId: (result && result.shopId) || null,
    shopIdSource: (result && result.shopIdSource) || null,
    hasShopName: !!(result && result.shopName),
    businessStatus: (result && result.businessStatus) || null,
    ok: !!(result && result.ok),
    error: (result && result.error) || null,
    looksLogin: extra.looksLogin === true,
    href: extra.href || null,
    orderCount: result && Array.isArray(result.orders) ? result.orders.length : 0,
    networkUrlCount: extra.networkUrlCount != null ? extra.networkUrlCount : undefined,
    parsedBodies: extra.parsedBodies != null ? extra.parsedBodies : undefined
  }
  if (meta.hasShopId && meta.ok) {
    logNative('[jddj-scraper] scrape ok', meta)
  } else {
    warnNative('[jddj-scraper] scrape incomplete', meta)
  }
}

function normalizeBusinessStatus(text) {
  const s = String(text || '').trim()
  if (!s) return '未知'
  for (const rule of selectors.BUSINESS_STATUS_MAP) {
    if (rule.re.test(s)) return rule.value
  }
  return '未知'
}

function isKnownBusinessStatus(status) {
  return status === '营业中' || status === '休息中'
}

function pickString(...candidates) {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function asArray(v) {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    for (const key of ['list', 'data', 'rows', 'records', 'orderList', 'orders', 'result']) {
      if (Array.isArray(v[key])) return v[key]
      if (v[key] && typeof v[key] === 'object' && Array.isArray(v[key].list)) {
        return v[key].list
      }
    }
  }
  return []
}

function mapOrderRow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const orderId = pickString(
    raw.orderId,
    raw.order_id,
    raw.orderNo,
    raw.order_no,
    raw.id,
    raw.billId
  )
  if (!orderId) return null
  return {
    orderId: String(orderId),
    status: pickString(
      raw.status,
      raw.statusName,
      raw.orderStatus,
      raw.orderStatusName,
      raw.stateDesc
    ) || '',
    amount: pickString(
      raw.amount,
      raw.orderAmount,
      raw.payAmount,
      raw.totalPrice,
      raw.shouldPay
    ) || '',
    createdAt: pickString(
      raw.createdAt,
      raw.createTime,
      raw.orderTime,
      raw.submitTime,
      raw.ctime
    ) || ''
  }
}

function extractFromJsonPayload(data) {
  const out = {
    shopName: null,
    shopId: null,
    shopIdSource: null,
    businessStatus: null,
    orders: []
  }
  if (!data || typeof data !== 'object') return out

  const dig = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 6) return
    if (Array.isArray(obj)) {
      for (const item of obj) dig(item, depth + 1)
      return
    }
    if (!out.shopName) {
      out.shopName = pickString(
        obj.shopName,
        obj.storeName,
        obj.stationName,
        obj.venderName,
        obj.merchantName,
        obj.name
      )
    }
    if (!out.shopId) {
      const sid = pickString(
        obj.shopId,
        obj.storeId,
        obj.stationId,
        obj.stationNo,
        obj.venderId,
        obj.orgCode,
        obj.merchantId
      )
      if (sid) {
        out.shopId = sid
        out.shopIdSource = 'xhr'
      }
    }
    if (!out.businessStatus || out.businessStatus === '未知') {
      const st = pickString(
        obj.businessStatus,
        obj.bizStatus,
        obj.storeStatus,
        obj.openStatus,
        obj.statusName,
        obj.businessStatusName
      )
      if (st) out.businessStatus = normalizeBusinessStatus(st)
    }
    const rows = asArray(obj)
    if (rows.length && !out.orders.length) {
      const mapped = rows.map(mapOrderRow).filter(Boolean)
      if (mapped.length) out.orders = mapped.slice(0, 50)
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') dig(v, depth + 1)
    }
  }

  dig(data)
  if (!out.shopId) {
    const found = extractShopIdFromPayload(data)
    if (found.shopId) {
      out.shopId = found.shopId
      out.shopIdSource = found.shopIdSource || 'xhr'
    }
  }
  return out
}

function tryParseJson(text) {
  const s = String(text || '').trim()
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    // some APIs wrap JSONP-ish
    const m = s.match(/^[^{[]*(\{[\s\S]*\}|\[[\s\S]*\])[^}\]]*$/)
    if (m) {
      try {
        return JSON.parse(m[1])
      } catch {
        return null
      }
    }
    return null
  }
}

function mergeExtract(target, part, options = {}) {
  if (!part) return target
  const preferPartShopId = options.preferPartShopId === true
  const preferPartBusinessStatus = options.preferPartBusinessStatus === true
  if (part.shopName && !target.shopName) target.shopName = part.shopName
  if (part.shopId) {
    if (preferPartShopId || !target.shopId) {
      target.shopId = part.shopId
      target.shopIdSource = part.shopIdSource || target.shopIdSource || null
    }
  }
  if (part.businessStatus && part.businessStatus !== '未知') {
    if (
      preferPartBusinessStatus ||
      !target.businessStatus ||
      target.businessStatus === '未知'
    ) {
      target.businessStatus = part.businessStatus
    }
  }
  if (part.orders && part.orders.length && !target.orders.length) {
    target.orders = part.orders
  }
  return target
}

/**
 * DOM 兜底：首页 span.store-id / 店名节点，并读取 localStorage.shopInfo。
 */
function buildDomEvalScript() {
  const shopIdSels = JSON.stringify(selectors.DOM.shopId)
  const shopSels = JSON.stringify(selectors.DOM.shopName)
  const statusSels = JSON.stringify(selectors.DOM.businessStatus)
  const orderSels = JSON.stringify(selectors.DOM.orderRows)
  const loginHints = JSON.stringify(selectors.LOGIN_HINTS)
  return `(function(){
    function textOf(el){
      if(!el) return '';
      return String(el.innerText || el.textContent || '').replace(/\\s+/g,' ').trim();
    }
    function htmlTextOf(el){
      if(!el) return '';
      return String(el.innerHTML||'').replace(/<[^>]+>/g,'').replace(/\\s+/g,' ').trim();
    }
    function firstText(sels){
      for(var i=0;i<sels.length;i++){
        try{
          var el=document.querySelector(sels[i]);
          var t=textOf(el);
          if(t) return t;
        }catch(e){}
      }
      return '';
    }
    function shopNameFromEl(el){
      if(!el) return '';
      try{
        var clone=el.cloneNode(true);
        var ids=clone.querySelectorAll('span.store-id,[class*="store-id"]');
        for(var i=0;i<ids.length;i++){
          if(ids[i].parentNode) ids[i].parentNode.removeChild(ids[i]);
        }
        return textOf(clone) || htmlTextOf(clone);
      }catch(e){
        return textOf(el);
      }
    }
    function firstShopName(sels){
      for(var i=0;i<sels.length;i++){
        try{
          var el=document.querySelector(sels[i]);
          var t=shopNameFromEl(el);
          if(t) return t;
        }catch(e){}
      }
      return '';
    }
    function shortStatusText(t){
      var s=String(t||'').replace(/\\s+/g,' ').trim();
      if(!s || s.length>16) return '';
      return s;
    }
    function firstStatus(sels){
      for(var i=0;i<sels.length;i++){
        try{
          var el=document.querySelector(sels[i]);
          var t=shortStatusText(textOf(el));
          if(t && (/休息中|打烊|暂停营业|歇业|营业中|开业中|开业/.test(t))) return t;
        }catch(e){}
      }
      return '';
    }
    function headerStatusFallback(){
      var roots=['.store-info-header','.store-header','#base-view-panel .store-info-header'];
      for(var i=0;i<roots.length;i++){
        try{
          var root=document.querySelector(roots[i]);
          var ht=textOf(root).slice(0,500);
          if(!ht) continue;
          if(/休息中|打烊|暂停营业|歇业/.test(ht)) return '休息中';
          if(/营业中|开业中/.test(ht)) return '营业中';
        }catch(e){}
      }
      return '';
    }
    var bodyText=textOf(document.body).slice(0,4000);
    var loginHints=${loginHints};
    var looksLogin=false;
    for(var h=0;h<loginHints.length;h++){
      if(bodyText.indexOf(loginHints[h])>=0){ looksLogin=true; break; }
    }
    var shopId=null;
    var shopIdSource=null;
    var shopIdSels=${shopIdSels};
    for(var si=0;si<shopIdSels.length;si++){
      try{
        var idEl=document.querySelector(shopIdSels[si]);
        var idVal=htmlTextOf(idEl) || textOf(idEl);
        if(idVal){
          shopId=idVal;
          shopIdSource='dom:store-id';
          break;
        }
      }catch(e){}
    }
    var shopName=firstShopName(${shopSels});
    var businessStatus=firstStatus(${statusSels}) || headerStatusFallback();
    var lsShopName=null;
    try{
      var raw=localStorage.getItem('shopInfo');
      if(raw){
        var info=JSON.parse(raw);
        if(info && typeof info==='object'){
          if(!shopId){
            var sid=String(info.stationNo||info.shopId||info.storeId||'').trim();
            if(sid){
              shopId=sid;
              shopIdSource='localStorage:shopInfo';
            }
          }
          var sn=String(info.shopName||info.storeName||info.stationName||'').trim();
          if(sn) lsShopName=sn;
          if(!businessStatus){
            var st=String(info.shopStatus!=null?info.shopStatus:(info.businessStatus||'')).trim();
            if(st==='0') businessStatus='营业中';
            else if(st==='1') businessStatus='休息中';
            else if(/休息中|打烊|暂停营业|歇业/.test(st)) businessStatus='休息中';
            else if(/营业中|开业中|开业/.test(st)) businessStatus='营业中';
          }
        }
      }
    }catch(e){}
    if(!shopName && lsShopName) shopName=lsShopName;
    var orders=[];
    var orderSels=${orderSels};
    for(var oi=0;oi<orderSels.length;oi++){
      try{
        var rows=document.querySelectorAll(orderSels[oi]);
        if(!rows||!rows.length) continue;
        for(var r=0;r<Math.min(rows.length,30);r++){
          var cells=rows[r].querySelectorAll('td,[class*="cell"],[class*="col"]');
          var texts=[];
          if(cells&&cells.length){
            for(var c=0;c<cells.length;c++){
              var ct=textOf(cells[c]);
              if(ct) texts.push(ct);
            }
          } else {
            var rt=textOf(rows[r]);
            if(rt) texts.push(rt);
          }
          if(!texts.length) continue;
          orders.push({
            orderId: texts[0]||'',
            status: texts[1]||'',
            amount: texts[2]||'',
            createdAt: texts[3]||''
          });
        }
        if(orders.length) break;
      }catch(e){}
    }
    return {
      shopName: shopName||null,
      shopId: shopId,
      shopIdSource: shopIdSource,
      businessStatus: businessStatus||null,
      orders: orders,
      looksLogin: looksLogin,
      pageTitle: document.title||'',
      href: location.href||''
    };
  })()`
}

/**
 * @param {number} port CDP debugging port
 * @param {{ entryUrl?: string, collectMs?: number, logContext?: { runId?: string, envId?: string } }} [options]
 */
async function scrapeJddj(port, options = {}) {
  const entryUrl = String(options.entryUrl || selectors.DEFAULT_ENTRY_URL).trim()
  const collectMs = options.collectMs != null ? Number(options.collectMs) : 14000
  const logCtx = options.logContext && typeof options.logContext === 'object' ? options.logContext : {}
  const fetchedAt = new Date().toISOString()
  const merged = {
    shopName: null,
    shopId: null,
    shopIdSource: null,
    businessStatus: '未知',
    orders: []
  }

  try {
    await cdpNavigate.waitForCdpReady(port, 15000)
    const navAt = Date.now()
    await cdpNavigate.navigateToUrl(port, entryUrl, 20000)
    await new Promise(r => setTimeout(r, 1500))
    logNative('jddj.scrape.navigate', {
      runId: logCtx.runId || null,
      envId: logCtx.envId || null,
      url: entryUrl,
      elapsedMs: Date.now() - navAt
    })

    // 1) Network intercept
    let net = { bodies: [], urls: [] }
    let parsedBodies = 0
    try {
      net = await cdpNavigate.collectNetworkResponses(port, {
        urlPatterns: selectors.XHR_URL_PATTERNS,
        navigateUrl: entryUrl,
        collectMs,
        preferUrlRe: /jddj\.com/i,
        maxBodies: 40
      })
      logNative('jddj.scrape.network', {
        runId: logCtx.runId || null,
        envId: logCtx.envId || null,
        persisted: false,
        urlCount: Array.isArray(net.urls) ? net.urls.length : 0,
        bodyCount: Array.isArray(net.bodies) ? net.bodies.length : 0,
        pageUrl: net.pageUrl || null,
        urls: (net.urls || []).slice(0, 30)
      })
    } catch (err) {
      // fail soft → DOM
      warnNative('jddj.scrape.network', {
        runId: logCtx.runId || null,
        envId: logCtx.envId || null,
        error: err.message
      })
    }

    for (const item of net.bodies || []) {
      const json = tryParseJson(item.body)
      if (!json) continue
      parsedBodies += 1
      const part = extractFromJsonPayload(json)
      mergeExtract(merged, {
        shopName: part.shopName,
        shopId: part.shopId,
        shopIdSource: part.shopIdSource,
        businessStatus: part.businessStatus || null,
        orders: part.orders
      })
    }

    // 2) DOM / evaluate fallback
    let dom = null
    try {
      dom = await cdpNavigate.cdpEvaluateOn(port, buildDomEvalScript(), {
        preferUrlRe: /jddj\.com/i,
        timeoutMs: 15000
      })
      logNative('jddj.scrape.dom', {
        runId: logCtx.runId || null,
        envId: logCtx.envId || null,
        href: (dom && dom.href) || null,
        looksLogin: !!(dom && dom.looksLogin),
        shopIdSource: (dom && dom.shopIdSource) || null,
        hasShopId: !!(dom && dom.shopId),
        hasShopName: !!(dom && dom.shopName)
      })
    } catch (err) {
      warnNative('jddj.scrape.dom', {
        runId: logCtx.runId || null,
        envId: logCtx.envId || null,
        error: err.message
      })
    }

    const scrapeExtra = {
      runId: logCtx.runId || null,
      envId: logCtx.envId || null,
      networkUrlCount: Array.isArray(net.urls) ? net.urls.length : 0,
      parsedBodies
    }

    if (dom) {
      if (dom.looksLogin && !merged.shopName && !merged.shopId && !merged.orders.length) {
        const loginFail = emptyResult({
          fetchedAt,
          ok: false,
          error: '登录失效或未登录京东到家商家后台',
          businessStatus: '未知'
        })
        logScrapeResult(loginFail, {
          ...scrapeExtra,
          looksLogin: true,
          href: dom.href || null
        })
        return loginFail
      }
      // DOM store-id / localStorage / 店头状态优先于 XHR
      const domStatus = dom.businessStatus
        ? normalizeBusinessStatus(dom.businessStatus)
        : '未知'
      mergeExtract(
        merged,
        {
          shopName: dom.shopName,
          shopId: dom.shopId,
          shopIdSource: dom.shopIdSource,
          businessStatus: isKnownBusinessStatus(domStatus) ? domStatus : null,
          orders: Array.isArray(dom.orders)
            ? dom.orders
                .map(o =>
                  o && o.orderId
                    ? {
                        orderId: String(o.orderId),
                        status: String(o.status || ''),
                        amount: String(o.amount || ''),
                        createdAt: String(o.createdAt || '')
                      }
                    : null
                )
                .filter(Boolean)
            : []
        },
        {
          preferPartShopId: !!(
            dom.shopId &&
            /^(dom:store-id|localStorage)/.test(String(dom.shopIdSource || ''))
          ),
          preferPartBusinessStatus: isKnownBusinessStatus(domStatus)
        }
      )
    }

    const hasSignal =
      !!merged.shopName ||
      !!merged.shopId ||
      (merged.businessStatus && merged.businessStatus !== '未知') ||
      (merged.orders && merged.orders.length > 0)

    if (!hasSignal) {
      const noSignal = emptyResult({
        fetchedAt,
        ok: false,
        error: '未能解析店铺/营业状态/订单（可能未登录或页面结构变更）'
      })
      logScrapeResult(noSignal, {
        ...scrapeExtra,
        looksLogin: !!(dom && dom.looksLogin),
        href: (dom && dom.href) || null
      })
      return noSignal
    }

    const okResult = {
      shopName: merged.shopName,
      shopId: merged.shopId || null,
      shopIdSource: merged.shopIdSource || null,
      businessStatus: normalizeBusinessStatus(merged.businessStatus),
      orders: merged.orders || [],
      fetchedAt,
      ok: true,
      error: null
    }
    logScrapeResult(okResult, {
      ...scrapeExtra,
      looksLogin: !!(dom && dom.looksLogin),
      href: (dom && dom.href) || null
    })
    return okResult
  } catch (err) {
    const fail = emptyResult({
      fetchedAt,
      ok: false,
      error: (err && err.message) || String(err)
    })
    logScrapeResult(fail, {
      runId: logCtx.runId || null,
      envId: logCtx.envId || null
    })
    return fail
  }
}

module.exports = {
  scrapeJddj,
  emptyResult,
  normalizeBusinessStatus,
  extractFromJsonPayload
}
