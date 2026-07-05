const express = require('express')
const cors = require('cors')

const {
  findUser,
  authMiddleware,
  publicUser,
  createSession,
  deleteSession
} = require('./middleware/auth')
const profilesRouter = require('./routes/profiles')

const PORT = process.env.PORT || 3001

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'virtualbrowser-backend', stack: 'express-legacy' })
})

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = findUser(username, password)
  if (!user) {
    res.status(401).json({ code: 401, message: '用户名或密码错误' })
    return
  }
  const token = createSession(user.id)
  res.json({
    code: 0,
    data: {
      token,
      user: publicUser(user)
    }
  })
})

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ code: 0, data: publicUser(req.user) })
})

app.post('/auth/logout', authMiddleware, (req, res) => {
  deleteSession(req.token)
  res.json({ code: 0, message: '已退出' })
})

app.use('/api/profiles', profilesRouter)

app.listen(PORT, () => {
  console.log(`[server-backend:legacy] http://localhost:${PORT}`)
})
