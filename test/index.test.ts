import type { ConfigEnv, ConfigPluginContext, UserConfig } from 'vite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineTypesPlugin } from '../src'

const tempDirs: string[] = []

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'define-types-plugin-'))
  tempDirs.push(root)
  return root
}

function createEnv(command: ConfigEnv['command']): ConfigEnv {
  return {
    command,
    isPreview: false,
    isSsrBuild: false,
    mode: 'test',
  }
}

function createConfigPluginContext(): ConfigPluginContext {
  return {
    debug: vi.fn(),
    error(message): never {
      throw new Error(typeof message === 'string' ? message : (message.message ?? 'Unknown error'))
    },
    info: vi.fn(),
    meta: {
      rolldownVersion: 'test',
      rollupVersion: 'test',
      viteVersion: 'test',
    },
    warn: vi.fn(),
  }
}

function runResolvedHook(
  hook: ReturnType<typeof defineTypesPlugin>['configResolved'],
  config: any,
) {
  if (!hook)
    return
  if (typeof hook === 'function') {
    hook.call({} as any, config)
    return
  }
  hook.handler.call({} as any, config)
}

function runPlugin(
  userConfig: UserConfig,
  options: Parameters<typeof defineTypesPlugin>[0],
) {
  const root = createTempRoot()
  const info = vi.fn()
  const warn = vi.fn()
  const plugin = defineTypesPlugin(options)

  if (typeof plugin.config === 'function')
    plugin.config.call(createConfigPluginContext(), userConfig, createEnv('serve'))

  runResolvedHook(plugin.configResolved, {
    logger: { info, warn },
    root,
  })

  return {
    info,
    plugin,
    root,
    warn,
  }
}

afterEach(() => {
  for (const dir of tempDirs)
    rmSync(dir, { force: true, recursive: true })
  tempDirs.length = 0
})

describe('defineTypesPlugin', () => {
  it('使用默认配置并且仅生成严格 __xxx__ 形式的 key', () => {
    const { plugin, root, warn } = runPlugin({
      define: {
        __APP_NAME__: JSON.stringify('demo'),
        APP_NAME: JSON.stringify('ignored'),
      },
    }, undefined)

    expect(plugin.apply).toBe('serve')

    const dtsPath = join(root, 'define-types.d.ts')
    const content = readFileSync(dtsPath, 'utf8')
    expect(content).toContain('declare const __APP_NAME__: string')
    expect(content).not.toContain('declare const APP_NAME:')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('支持 excludeKeys 排除指定 key', () => {
    const { info, root } = runPlugin({
      define: {
        __A__: '1',
        __B__: '2',
      },
    }, {
      excludeKeys: ['__B__'],
    })

    const content = readFileSync(join(root, 'define-types.d.ts'), 'utf8')
    expect(content).toContain('declare const __A__: number')
    expect(content).not.toContain('declare const __B__:')
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('支持 strictDefineKey=false 时生成普通合法标识符', () => {
    const { root, warn } = runPlugin({
      define: {
        'APP_NAME': JSON.stringify('demo'),
        '$FLAG': true,
        'foo-bar': true,
      },
    }, {
      strictDefineKey: false,
    })

    const content = readFileSync(join(root, 'define-types.d.ts'), 'utf8')
    expect(content).toContain('declare const APP_NAME: string')
    expect(content).toContain('declare const $FLAG: boolean')
    expect(content).not.toContain('foo-bar')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('支持写入自定义 outputPath 并自动创建目录', () => {
    const { root } = runPlugin({
      define: {
        __A__: '1',
      },
    }, {
      outputPath: 'types/define-types.d.ts',
    })

    const content = readFileSync(join(root, 'types/define-types.d.ts'), 'utf8')
    expect(content).toContain('declare const __A__: number')
  })

  it('生成内容应覆盖常见类型推断（string/number/boolean 等）', () => {
    const { root } = runPlugin({
      define: {
        __BOOL__: true,
        __NULL__: 'null',
        __NUM__: '123',
        __OBJ__: JSON.stringify({ a: 1 }),
        __RAW_OBJ__: { a: 1 },
        __STR__: JSON.stringify('hello'),
        __UNKNOWN__: 'window.__UNKNOWN__',
        __ARR__: JSON.stringify([1, 2, 3]),
      },
    }, undefined)

    const content = readFileSync(join(root, 'define-types.d.ts'), 'utf8')
    expect(content).toContain('declare const __STR__: string')
    expect(content).toContain('declare const __NUM__: number')
    expect(content).toContain('declare const __BOOL__: boolean')
    expect(content).toContain('declare const __NULL__: null')
    expect(content).toContain('declare const __ARR__: unknown[]')
    expect(content).toContain('declare const __OBJ__: Record<string, unknown>')
    expect(content).toContain('declare const __RAW_OBJ__: Record<string, unknown>')
    expect(content).toContain('declare const __UNKNOWN__: unknown')
  })
})
