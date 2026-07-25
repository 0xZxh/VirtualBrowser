/**
 * 京东到家门店后台抓取：优先 CDP 拦截 XHR，DOM / Runtime.evaluate 兜底。
 */
const cdpNavigate = require('./cdp-navigate')
const selectors = require('./jddj-selectors')

function emptyResult(partial = {}) {
  return {
    shopName: null,
    businessStatus: '未知',
    orders: [],
    fetchedAt: new Date().toISOString(),
    ok: false,
    error: null,
    ...partial
  }
}

function normalizeBusinessStatus(text) {
  const s = String(text || '').trim()
  if (!s) return '未知'
  for (const rule of selectors.BUSINESS_STATUS_MAP) {
    if (rule.re.test(s)) return rule.value
  }
  if (/营业|休息|打烊|开业/.test(s)) return s.slice(0, 32)
  return '未知'
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

function mergeExtract(target, part) {
  if (!part) return target
  if (part.shopName && !target.shopName) target.shopName = part.shopName
  if (part.businessStatus && part.businessStatus !== '未知') {
    if (!target.businessStatus || target.businessStatus === '未知') {
      target.businessStatus = part.businessStatus
    }
  }
  if (part.orders && part.orders.length && !target.orders.length) {
    target.orders = part.orders
  }
  return target
}

/**
 * DOM 兜底：在页面执行选择器脚本。
 */
function buildDomEvalScript() {
  const shopSels = JSON.stringify(selectors.DOM.shopName)
  const statusSels = JSON.stringify(selectors.DOM.businessStatus)
  const orderSels = JSON.stringify(selectors.DOM.orderRows)
  const loginHints = JSON.stringify(selectors.LOGIN_HINTS)
  return `(function(){
    function textOf(el){
      if(!el) return '';
      return String(el.innerText || el.textContent || '').replace(/\\s+/g,' ').trim();
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
    var bodyText=textOf(document.body).slice(0,4000);
    var loginHints=${loginHints};
    var looksLogin=false;
    for(var h=0;h<loginHints.length;h++){
      if(bodyText.indexOf(loginHints[h])>=0){ looksLogin=true; break; }
    }
    var shopName=firstText(${shopSels});
    var businessStatus=firstText(${statusSels});
    if(!businessStatus){
      if(/营业中/.test(bodyText)) businessStatus='营业中';
      else if(/休息中|打烊|暂停营业/.test(bodyText)) businessStatus='休息中';
    }
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
 * @param {{ entryUrl?: string, collectMs?: number }} [options]
 */
async function scrapeJddj(port, options = {}) {
  const entryUrl = String(options.entryUrl || selectors.DEFAULT_ENTRY_URL).trim()
  const collectMs = options.collectMs != null ? Number(options.collectMs) : 14000
  const fetchedAt = new Date().toISOString()
  const merged = {
    shopName: null,
    businessStatus: '未知',
    orders: []
  }

  try {
    await cdpNavigate.waitForCdpReady(port, 15000)
    await cdpNavigate.navigateToUrl(port, entryUrl, 20000)
    await new Promise(r => setTimeout(r, 1500))

    // 1) Network intercept
    let net = { bodies: [] }
    try {
      net = await cdpNavigate.collectNetworkResponses(port, {
        urlPatterns: selectors.XHR_URL_PATTERNS,
        navigateUrl: entryUrl,
        collectMs,
        preferUrlRe: /jddj\.com/i,
        maxBodies: 40
      })
    } catch (err) {
      // fail soft → DOM
      console.warn('[jddj-scraper] network intercept failed:', err.message)
    }

    for (const item of net.bodies || []) {
      const json = tryParseJson(item.body)
      if (!json) continue
      const part = extractFromJsonPayload(json)
      mergeExtract(merged, {
        shopName: part.shopName,
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
    } catch (err) {
      console.warn('[jddj-scraper] DOM evaluate failed:', err.message)
    }

    if (dom) {
      if (dom.looksLogin && !merged.shopName && !merged.orders.length) {
        return emptyResult({
          fetchedAt,
          ok: false,
          error: '登录失效或未登录京东到家商家后台',
          businessStatus: '未知'
        })
      }
      mergeExtract(merged, {
        shopName: dom.shopName,
        businessStatus: dom.businessStatus
          ? normalizeBusinessStatus(dom.businessStatus)
          : null,
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
      })
    }

    const hasSignal =
      !!merged.shopName ||
      (merged.businessStatus && merged.businessStatus !== '未知') ||
      (merged.orders && merged.orders.length > 0)

    if (!hasSignal) {
      return emptyResult({
        fetchedAt,
        ok: false,
        error: '未能解析店铺/营业状态/订单（可能未登录或页面结构变更）'
      })
    }

    return {
      shopName: merged.shopName,
      businessStatus: normalizeBusinessStatus(merged.businessStatus),
      orders: merged.orders || [],
      fetchedAt,
      ok: true,
      error: null
    }
  } catch (err) {
    return emptyResult({
      fetchedAt,
      ok: false,
      error: (err && err.message) || String(err)
    })
  }
}

module.exports = {
  scrapeJddj,
  emptyResult,
  normalizeBusinessStatus,
  extractFromJsonPayload
}
