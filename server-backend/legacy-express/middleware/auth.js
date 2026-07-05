/** @type {Map<string, {userId:number,expiresAt:number}>} */
const sessions = new Map()

const users = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    name: '管理员',
    roles: ['admin']
  },
  {
    id: 2,
    username: 'operator',
    password: 'operator123',
    name: '操作员',
    roles: ['operator']
  },
  {
    id: 3,
    username: 'viewer',
    password: 'viewer123',
    name: '访客',
    roles: ['viewer']
  }
]

function findUser(username, password) {
  return users.find(u => u.username === username && u.password === password)
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

function authMiddleware(req, res, next) {
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ code: 401, message: '未登录' })
    return
  }
  const session = sessions.get(token)
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token)
    res.status(401).json({ code: 401, message: '登录已过期' })
    return
  }
  const user = users.find(u => u.id === session.userId)
  if (!user) {
    res.status(401).json({ code: 401, message: '用户不存在' })
    return
  }
  req.user = user
  req.token = token
  next()
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roles: user.roles
  }
}

function createSession(userId) {
  const crypto = require('crypto')
  const token = crypto.randomBytes(24).toString('hex')
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  })
  return token
}

function deleteSession(token) {
  sessions.delete(token)
}

module.exports = {
  users,
  findUser,
  getBearerToken,
  authMiddleware,
  publicUser,
  createSession,
  deleteSession
}
