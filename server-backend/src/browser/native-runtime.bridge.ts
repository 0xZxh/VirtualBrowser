import * as path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nativeRuntime = require(path.join(repoRoot, 'server/lib/native-runtime'))

export interface LaunchResult {
  ok: boolean
  debuggingPort: number
  envId: string
}

export interface StopResult {
  ok: boolean
  envId: string
  wasRunning: boolean
}

export const nativeRuntimeBridge = {
  allocateDebugPort(): number {
    return nativeRuntime.allocateDebugPort()
  },

  releaseDebugPort(port: number): void {
    nativeRuntime.releaseDebugPort(port)
  },

  launchBrowser(
    envId: string | number,
    req?: { headers?: Record<string, string> },
    options?: { tempLaunchArgs?: string[] }
  ): Promise<LaunchResult> {
    return nativeRuntime.launchBrowser(envId, req || null, options || {})
  },

  stopBrowser(envId: string | number, req?: { headers?: Record<string, string> }): Promise<StopResult> {
    return nativeRuntime.stopBrowser(envId, req || null)
  },

  getRunningIds(): string[] {
    return nativeRuntime.getRunningIds()
  },

  handleNativeCall(
    name: string,
    params?: unknown[],
    req?: { headers?: Record<string, string> }
  ): Promise<unknown> {
    return nativeRuntime.handleNativeCall(name, params || [], req || null)
  }
}
