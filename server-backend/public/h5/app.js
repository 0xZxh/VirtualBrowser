;(function () {
  const TOKEN_KEY = 'VB_H5_TOKEN'
  const USER_KEY = 'VB_H5_USER'
  const DEFAULT_HOME = 'https://store.jddj.com/'

  const $ = (id) => document.getElementById(id)

  const loginView = $('loginView')
  const createView = $('createView')
  const userBar = $('userBar')
  const userNameEl = $('userName')
  const loginError = $('loginError')
  const createMsg = $('createMsg')

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

  function showLogin() {
    loginView.classList.remove('hidden')
    createView.classList.add('hidden')
    userBar.classList.add('hidden')
  }

  function showCreate(user) {
    loginView.classList.add('hidden')
    createView.classList.remove('hidden')
    userBar.classList.remove('hidden')
    userNameEl.textContent = (user && (user.name || user.username)) || '已登录'
    if (!$('envHomepage').value) {
      $('envHomepage').value = DEFAULT_HOME
    }
  }

  async function boot() {
    const token = getToken()
    const cached = getUser()
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
      showCreate(user)
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
      showCreate(user)
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
    const group = $('envGroup').value.trim() || '默认分组'
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
      try {
        const parsed = JSON.parse(cookieRaw)
        if (!Array.isArray(parsed)) {
          throw new Error('Cookie 必须是 JSON 数组')
        }
        body.cookie = {
          mode: 1,
          value: parsed,
          jsonStr: JSON.stringify(parsed, null, 2)
        }
      } catch (err) {
        createMsg.textContent = 'Cookie 格式错误: ' + (err.message || err)
        createMsg.classList.add('err')
        return
      }
    }

    $('btnCreate').disabled = true
    try {
      const res = await request('/api/environments', { method: 'POST', body })
      const id = res.data && res.data.id
      createMsg.textContent = '创建成功' + (id != null ? '，环境 ID：' + id : '')
      createMsg.classList.add('ok')
      $('envName').value = ''
      $('envCookie').value = ''
    } catch (err) {
      createMsg.textContent = err.message || String(err)
      createMsg.classList.add('err')
    } finally {
      $('btnCreate').disabled = false
    }
  })

  boot()
})()
