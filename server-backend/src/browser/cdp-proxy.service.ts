import { Injectable, OnModuleDestroy } from '@nestjs/common'
import * as http from 'http'
import * as net from 'net'

@Injectable()
export class CdpProxyService implements OnModuleDestroy {
  private readonly servers = new Map<number, http.Server>()

  onModuleDestroy() {
    for (const [port, server] of this.servers.entries()) {
      server.close()
      this.servers.delete(port)
    }
  }

  /**
   * Playwright 在 Windows 上常将 localhost 解析为 ::1，而 Chromium 默认只监听 127.0.0.1。
   * 在 [::1]:publicPort 暴露 HTTP/TCP 代理，转发到 127.0.0.1:chromePort。
   */
  async ensureIpv6Proxy(publicPort: number, chromePort: number): Promise<void> {
    if (this.servers.has(publicPort)) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const server = http.createServer((clientReq, clientRes) => {
        const opts = {
          hostname: '127.0.0.1',
          port: chromePort,
          path: clientReq.url,
          method: clientReq.method,
          headers: clientReq.headers
        }

        const upstream = http.request(opts, upstreamRes => {
          const headers = { ...upstreamRes.headers }
          const bodyChunks: Buffer[] = []

          upstreamRes.on('data', chunk => bodyChunks.push(Buffer.from(chunk)))
          upstreamRes.on('end', () => {
            let body = Buffer.concat(bodyChunks)
            const contentType = String(headers['content-type'] || '')
            if (contentType.includes('application/json')) {
              const text = body
                .toString('utf8')
                .replace(/127\.0\.0\.1:\d+/g, `[::1]:${publicPort}`)
              body = Buffer.from(text, 'utf8')
              headers['content-length'] = String(body.length)
            }
            clientRes.writeHead(upstreamRes.statusCode || 200, headers)
            clientRes.end(body)
          })
        })

        upstream.on('error', err => {
          clientRes.statusCode = 502
          clientRes.end(`CDP proxy error: ${err.message}`)
        })

        clientReq.pipe(upstream)
      })

      server.on('upgrade', (req, socket, head) => {
        const upstream = net.connect(chromePort, '127.0.0.1', () => {
          const lines = [`${req.method} ${req.url} HTTP/1.1`]
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) lines.push(`${key}: ${v}`)
            } else if (value) {
              lines.push(`${key}: ${value}`)
            }
          }
          lines.push('', '')
          upstream.write(lines.join('\r\n'))
          if (head && head.length) upstream.write(head)
          socket.pipe(upstream)
          upstream.pipe(socket)
        })
        upstream.on('error', () => socket.destroy())
        socket.on('error', () => upstream.destroy())
      })

      server.once('error', reject)
      server.listen(publicPort, '::1', () => {
        this.servers.set(publicPort, server)
        resolve()
      })
    })
  }

  release(publicPort: number) {
    const server = this.servers.get(publicPort)
    if (server) {
      server.close()
      this.servers.delete(publicPort)
    }
  }
}
