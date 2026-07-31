/**
 * 京东到家商家后台：URL / 选择器 / XHR 匹配（后台改版时优先改本文件）。
 */

const DEFAULT_ENTRY_URL = 'https://store.jddj.com/'

/** 登录失效相关文案（DOM 兜底） */
const LOGIN_HINTS = [
  '请登录',
  '重新登录',
  '登录已过期',
  '账号登录',
  '扫码登录',
  '用户名登录'
]

/**
 * XHR URL 子串 / 正则：订单列表、门店信息（按探测结果调整）。
 */
const XHR_URL_PATTERNS = [
  /order/i,
  /store/i,
  /shop/i,
  /station/i,
  /business/i,
  /vender/i,
  /merchant/i,
  /门店/,
  /djstore/i,
  /storeInfo/i,
  /getStore/i,
  /queryOrder/i,
  /orderList/i,
  /order\/query/i
]

/** DOM 选择器兜底（多候选，按稳定性排序） */
const DOM = {
  shopId: [
    '#base-view-panel span.store-id',
    '.store-info-header span.store-id',
    'span.store-id'
  ],
  shopName: [
    // 店名容器（勿落到 span.store-id）
    '#base-view-panel .store-info-header .store-name',
    '.store-info-header .store-name',
    '#base-view-panel [class*="store-info-header"] [class*="store-name"]',
    '[class*="store-info-header"] [class*="store-name"]',
    '[class*="shop-name"]',
    '[class*="store-name"]',
    '[class*="shopName"]',
    '[class*="storeName"]',
    '.header-shop-name',
    '.store-info .name',
    '[data-testid="shop-name"]'
  ],
  businessStatus: [
    // 仅店头区域，避免整页误命中
    '#base-view-panel .store-info-header [class*="status"]',
    '.store-info-header [class*="status"]',
    '.store-header [class*="status"]',
    '.store-info-header .store-status',
    '.store-header .store-status',
    '[data-testid="business-status"]'
  ],
  orderRows: [
    'table tbody tr',
    '[class*="order-list"] [class*="order-item"]',
    '[class*="orderList"] [class*="item"]',
    '.ant-table-tbody tr',
    '.el-table__body tr'
  ]
}

/** 营业状态关键词归一化（休息/暂停优先于营业，勿裸匹配「营业」） */
const BUSINESS_STATUS_MAP = [
  { re: /休息中|打烊|暂停营业|歇业/, value: '休息中' },
  { re: /营业中|开业中|开业/, value: '营业中' }
]

module.exports = {
  DEFAULT_ENTRY_URL,
  LOGIN_HINTS,
  XHR_URL_PATTERNS,
  DOM,
  BUSINESS_STATUS_MAP
}
