/**
 * smoke: dated log file names
 * node server/lib/__tests__/file-logger-dated.js
 */
const assert = require('assert')
const { resolveLogFileName, localDateStamp } = require('../file-logger')

const day = localDateStamp()
assert.strictEqual(resolveLogFileName('native'), `native-${day}.log`)
assert.strictEqual(resolveLogFileName('native.log'), `native-${day}.log`)
assert.strictEqual(resolveLogFileName('ui.log'), `ui-${day}.log`)
assert.strictEqual(resolveLogFileName('backend'), `backend-${day}.log`)
assert.strictEqual(resolveLogFileName('native-2020-01-01.log'), 'native-2020-01-01.log')

console.log('file-logger-dated: ok', day)
