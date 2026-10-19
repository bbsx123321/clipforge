import { describe, expect, it } from 'vitest'
import { isPathInsideRoot } from '../src/main/media-service'
import path from 'node:path'

const ROOT: string = path.resolve('D:/recordings')

describe('录制目录删除的路径安全校验', () => {
  it('输出根目录内的子目录放行', () => {
    expect(isPathInsideRoot(path.join(ROOT, 'session-1'), ROOT)).toBe(true)
    expect(isPathInsideRoot(path.join(ROOT, 'a/b/c'), ROOT)).toBe(true)
  })

  it('根目录本身与根目录之外一律拒绝', () => {
    expect(isPathInsideRoot(ROOT, ROOT)).toBe(false)
    expect(isPathInsideRoot('D:/recordings-evil', ROOT)).toBe(false)
    expect(isPathInsideRoot('C:/Windows/System32', ROOT)).toBe(false)
  })

  it('相似前缀目录不误放行（recordings-2 不是 recordings 子目录）', () => {
    expect(isPathInsideRoot(`${ROOT}-backup`, ROOT)).toBe(false)
  })
})
