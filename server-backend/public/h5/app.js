;(function () {
  const TOKEN_KEY = 'VB_H5_TOKEN'
  const USER_KEY = 'VB_H5_USER'
  const DEFAULT_HOME = 'https://store.jddj.com/'
  const DEFAULT_GROUP = '默认分组'

  const $ = (id) => document.getElementById(id)

  const loginView = $('loginView')
  const createView = $('createView')
  const userBar = $('userBar')
  const userNameEl = $('userName')
  const loginError = $('loginError')
  const createMsg = $('createMsg')
  const envGroupInput = $('envGroup')
  const groupSuggest = $('groupSuggest')

  let groupNames = [DEFAULT_GROUP]
  let suggestOpen = false

  function apiBase() {
    // Same-origin when served from Nest /h5/
    return ''
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      return null
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token || '')
    localStorage.setItem(USER_KEY, JSON.stringify(user || null))
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function canCreate(user) {
    const roles = (user && user.roles) || []
    return roles.includes('admin') || roles.includes('operator')
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
    const token = getToken()
    if (token) headers.Authorization = 'Bearer ' + token
    const res = await fetch(apiBase() + path, {
      method: options.method || 'GET',
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined
    })
    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    if (!res.ok) {
      const msg = (data && data.message) || res.statusText || '请求失败'
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
    if (data && data.code !== 0 && data.code !== 20000) {
      throw new Error(data.message || '请求失败')
    }
    return data
  }

  function normalizeGroupList(list) {
    const names = new Set([DEFAULT_GROUP])
    ;(list || []).forEach((item) => {
      const name =
        typeof item === 'string'
          ? item.trim()
          : item && item.name != null
            ? String(item.name).trim()
            : ''
      if (name) names.add(name)
    })
    return Array.from(names).sort((a, b) => {
      if (a === DEFAULT_GROUP) return -1
      if (b === DEFAULT_GROUP) return 1
      return a.localeCompare(b, 'zh')
    })
  }

  async function loadGroups() {
    try {
      const res = await request('/api/groups')
      groupNames = normalizeGroupList(res.data)
    } catch {
      groupNames = normalizeGroupList(groupNames)
    }
    if (!envGroupInput.value.trim()) {
      envGroupInput.value = DEFAULT_GROUP
    }
  }

  function filterGroups(query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return groupNames.slice()
    return groupNames.filter((name) => name.toLowerCase().includes(q))
  }

  function hideSuggest() {
    suggestOpen = false
    groupSuggest.classList.add('hidden')
    groupSuggest.innerHTML = ''
  }

  function showSuggest(query) {
    const q = String(query || '').trim()
    const matched = filterGroups(q)
    const exact = groupNames.some((name) => name === q)
    groupSuggest.innerHTML = ''

    matched.forEach((name) => {
      const li = document.createElement('li')
      li.setAttribute('role', 'option')
      li.textContent = name
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        envGroupInput.value = name
        hideSuggest()
      })
      groupSuggest.appendChild(li)
    })

    if (q && !exact) {
      const li = document.createElement('li')
      li.className = 'create'
      li.setAttribute('role', 'option')
      li.textContent = '创建分组「' + q + '」'
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        envGroupInput.value = q
        hideSuggest()
      })
      groupSuggest.appendChild(li)
    }

    if (!groupSuggest.children.length) {
      const li = document.createElement('li')
      li.className = 'muted'
      li.textContent = '暂无匹配，输入后将自动创建'
      groupSuggest.appendChild(li)
    }

    suggestOpen = true
    groupSuggest.classList.remove('hidden')
  }

  function bindGroupCombo() {
    envGroupInput.addEventListener('focus', () => {
      showSuggest(envGroupInput.value)
    })
    envGroupInput.addEventListener('input', () => {
      showSuggest(envGroupInput.value)
    })
    envGroupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSuggest()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        hideSuggest()
      }
    })
    envGroupInput.addEventListener('blur', () => {
      setTimeout(hideSuggest, 150)
    })
    document.addEventListener('click', (e) => {
      if (!suggestOpen) return
      const wrap = envGroupInput.closest('.combo')
      if (wrap && !wrap.contains(e.target)) hideSuggest()
    })
  }

  function showLogin() {
    loginView.classList.remove('hidden')
    createView.classList.add('hidden')
    userBar.classList.add('hidden')
  }

  async function showCreate(user) {
    loginView.classList.add('hidden')
    createView.classList.remove('hidden')
    userBar.classList.remove('hidden')
    userNameEl.textContent = (user && (user.name || user.username)) || '已登录'
    if (!$('envHomepage').value) {
      $('envHomepage').value = DEFAULT_HOME
    }
    if (!envGroupInput.value.trim()) {
      envGroupInput.value = DEFAULT_GROUP
    }
    await loadGroups()
  }

  async function boot() {
    const token = getToken()
    if (!token) {
      showLogin()
      return
    }
    try {
      const res = await request('/auth/me')
      const user = res.data
      if (!canCreate(user)) {
        clearSession()
        showLogin()
        loginError.textContent = '当前账号无创建权限（需要 admin / operator）'
        return
      }
      setSession(token, user)
      await showCreate(user)
    } catch (err) {
      clearSession()
      showLogin()
    }
  }

  $('btnLogin').addEventListener('click', async () => {
    loginError.textContent = ''
    const username = $('username').value.trim()
    const password = $('password').value
    if (!username || !password) {
      loginError.textContent = '请输入账号和密码'
      return
    }
    $('btnLogin').disabled = true
    try {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { username, password }
      })
      const token = res.data && res.data.token
      const user = res.data && res.data.user
      if (!token) throw new Error('登录响应缺少 token')
      if (!canCreate(user)) {
        throw new Error('当前账号无创建权限（需要 admin / operator）')
      }
      setSession(token, user)
      await showCreate(user)
    } catch (err) {
      loginError.textContent = err.message || String(err)
    } finally {
      $('btnLogin').disabled = false
    }
  })

  $('btnLogout').addEventListener('click', async () => {
    try {
      await request('/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    clearSession()
    showLogin()
  })

  $('btnCreate').addEventListener('click', async () => {
    createMsg.textContent = ''
    createMsg.className = 'msg'
    const name = $('envName').value.trim()
    const group = envGroupInput.value.trim() || DEFAULT_GROUP
    const homepage = $('envHomepage').value.trim() || DEFAULT_HOME
    const cookieRaw = $('envCookie').value.trim()

    if (!name) {
      createMsg.textContent = '请填写名称'
      createMsg.classList.add('err')
      return
    }

    const body = {
      name,
      group,
      homepage: { mode: 1, value: homepage }
    }

    if (cookieRaw) {
      const parse = window.VbCookieParse
      if (!parse || typeof parse.parseCookieInput !== 'function') {
        createMsg.textContent = 'Cookie 解析脚本未加载'
        createMsg.classList.add('err')
        return
      }
      const domain = parse.domainFromHomepage(homepage)
      const parsed = parse.parseCookieInput(cookieRaw, { domain, homepage })
      if (!parsed || !parsed.length) {
        createMsg.textContent = 'Cookie 格式错误：请粘贴 JSON 数组或 name=value; ... 头格式'
        createMsg.classList.add('err')
        return
      }
      const withDomain = parsed.map((item) => {
        if (!item || typeof item !== 'object') return item
        const c = Object.assign({}, item)
        if (!c.domain) c.domain = domain
        if (!c.path) c.path = '/'
        return c
      })
      const invalid = withDomain.some(
        (c) => !c || !c.name || c.value == null || c.value === '' || !c.domain
      )
      if (invalid) {
        createMsg.textContent = 'Cookie 格式错误：缺少 name/value/domain'
        createMsg.classList.add('err')
        return
      }
      body.cookie = {
        mode: 1,
        value: withDomain,
        jsonStr: JSON.stringify(withDomain, null, 2)
      }
    }

    $('btnCreate').disabled = true
    try {
      // 不存在则创建分组（服务端 create 也会 ensure；此处保证列表即时刷新）
      if (!groupNames.includes(group)) {
        await request('/api/groups', { method: 'POST', body: { name: group } })
      }
      const res = await request('/api/environments', { method: 'POST', body })
      const id = res.data && res.data.id
      createMsg.textContent = '创建成功' + (id != null ? '，环境 ID：' + id : '')
      createMsg.classList.add('ok')
      $('envName').value = ''
      $('envCookie').value = ''
      await loadGroups()
      envGroupInput.value = group
    } catch (err) {
      createMsg.textContent = err.message || String(err)
      createMsg.classList.add('err')
    } finally {
      $('btnCreate').disabled = false
    }
  })

  bindGroupCombo()
  boot()
})()
