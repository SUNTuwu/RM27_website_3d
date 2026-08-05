import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const readSource = (path) => readFile(new URL(path, root), 'utf8')

async function loadPerformanceRuntime() {
  const source = await readSource('assets/performance.js')
  const documentListeners = new Map()
  const windowListeners = new Map()
  const frameCallbacks = new Map()
  let nextFrameId = 1

  const documentSource = {
    hidden: false,
    addEventListener(type, listener) {
      documentListeners.set(type, listener)
    },
  }

  const windowSource = {
    document: documentSource,
    innerWidth: 1440,
    devicePixelRatio: 3,
    navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
    addEventListener(type, listener) {
      windowListeners.set(type, listener)
    },
    requestAnimationFrame(callback) {
      const frameId = nextFrameId
      nextFrameId += 1
      frameCallbacks.set(frameId, callback)
      return frameId
    },
    cancelAnimationFrame(frameId) {
      frameCallbacks.delete(frameId)
    },
    setTimeout,
  }

  vm.runInNewContext(source, { window: windowSource })

  return {
    runtime: windowSource.ENTERPRIZE_PERFORMANCE,
    documentSource,
    dispatchDocument(type) {
      documentListeners.get(type)?.()
    },
    dispatchWindow(type) {
      windowListeners.get(type)?.()
    },
    flushFrame(timestamp) {
      const callbacks = [...frameCallbacks.values()]
      frameCallbacks.clear()
      callbacks.forEach((callback) => callback(timestamp))
    },
    pendingFrames() {
      return frameCallbacks.size
    },
  }
}

test('performance profiles cap mobile and constrained-device work', async () => {
  const { runtime } = await loadPerformanceRuntime()
  const desktop = runtime.createPerformanceProfile({
    surface: 'home',
    width: 1440,
    devicePixelRatio: 3,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  })
  const mobile = runtime.createPerformanceProfile({
    surface: 'home',
    width: 375,
    devicePixelRatio: 3,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  })
  const constrained = runtime.createPerformanceProfile({
    surface: 'archive',
    width: 1440,
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
    deviceMemory: 4,
  })

  assert.equal(desktop.targetFps, 60)
  assert.equal(desktop.pixelRatio, 1.5)
  assert.equal(desktop.enableSmoothScroll, true)
  assert.equal(mobile.targetFps, 30)
  assert.equal(mobile.pixelRatio, 1)
  assert.ok(mobile.particleScale < desktop.particleScale)
  assert.equal(mobile.enableMouseWarp, false)
  assert.equal(mobile.enableHoloLighting, false)
  assert.equal(constrained.targetFps, 30)
  assert.equal(constrained.pixelRatio, 1)

  const breakpoint = runtime.createPerformanceProfile({
    surface: 'home',
    width: 720,
    devicePixelRatio: 2,
    coarsePointer: false,
  })
  assert.equal(breakpoint.tier, 'mobile')
  assert.equal(breakpoint.targetFps, 30)

  const coarseTablet = runtime.createPerformanceProfile({
    surface: 'home',
    width: 1024,
    height: 1366,
    devicePixelRatio: 2,
    coarsePointer: true,
  })
  assert.equal(coarseTablet.tier, 'mobile')
  assert.equal(coarseTablet.targetFps, 30)
  assert.equal(coarseTablet.enableHoloLighting, false)

  const largeDisplay = runtime.createPerformanceProfile({
    surface: 'home',
    width: 3840,
    height: 2160,
    devicePixelRatio: 2,
    coarsePointer: false,
  })
  assert.ok(3840 * 2160 * largeDisplay.pixelRatio ** 2 <= 3_000_001)
  assert.ok(largeDisplay.pixelRatio < 1)
})

test('animation scheduler enforces a 30 FPS callback budget', async () => {
  const harness = await loadPerformanceRuntime()
  const scheduler = harness.runtime.createAnimationScheduler({ targetFps: 30 })
  let tickCount = 0

  scheduler.add(() => { tickCount += 1 })
  scheduler.start()
  ;[16.667, 33.334, 50.001, 66.668, 83.335, 100.002, 116.669].forEach((timestamp) => {
    harness.flushFrame(timestamp)
  })

  assert.equal(tickCount, 4)
  assert.equal(scheduler.getSnapshot().tickCount, 4)
  assert.equal(harness.pendingFrames(), 1)
})

test('animation scheduler preserves target cadence on high-refresh displays', async () => {
  const harness = await loadPerformanceRuntime()
  const scheduler = harness.runtime.createAnimationScheduler({ targetFps: 60 })
  let tickCount = 0

  scheduler.add(() => { tickCount += 1 })
  scheduler.start()
  for (let frame = 1; frame <= 144; frame += 1) {
    harness.flushFrame(frame * (1000 / 144))
  }

  assert.ok(tickCount >= 59 && tickCount <= 61, `expected about 60 ticks, received ${tickCount}`)
  scheduler.setTargetFps(30)
  assert.equal(scheduler.getSnapshot().targetFps, 30)
})

test('animation scheduler pauses all callbacks for hidden and pagehide states', async () => {
  const hiddenHarness = await loadPerformanceRuntime()
  hiddenHarness.documentSource.hidden = true
  const hiddenStartScheduler = hiddenHarness.runtime.createAnimationScheduler({ targetFps: 30 })
  hiddenStartScheduler.add(() => {})
  hiddenStartScheduler.start()
  assert.equal(hiddenStartScheduler.getSnapshot().isRunning, false)
  assert.equal(hiddenStartScheduler.getSnapshot().pendingFrameCount, 0)

  const harness = await loadPerformanceRuntime()
  const idleScheduler = harness.runtime.createAnimationScheduler({ targetFps: 30 })
  harness.dispatchWindow('pageshow')
  assert.equal(idleScheduler.getSnapshot().pendingFrameCount, 0)

  const scheduler = harness.runtime.createAnimationScheduler({ targetFps: 30 })
  let tickCount = 0

  scheduler.add(() => { tickCount += 1 })
  scheduler.start()
  assert.equal(harness.pendingFrames(), 1)

  harness.flushFrame(34)
  assert.equal(tickCount, 1)
  assert.equal(harness.pendingFrames(), 1)

  harness.documentSource.hidden = true
  harness.dispatchDocument('visibilitychange')
  assert.equal(harness.pendingFrames(), 0)

  harness.flushFrame(68)
  assert.equal(tickCount, 1)

  harness.documentSource.hidden = false
  harness.dispatchDocument('visibilitychange')
  harness.dispatchDocument('visibilitychange')
  assert.equal(harness.pendingFrames(), 1)

  harness.flushFrame(102)
  assert.equal(tickCount, 2)

  harness.dispatchWindow('pagehide')
  assert.equal(harness.pendingFrames(), 0)
  assert.equal(scheduler.getSnapshot().isRunning, false)
})

test('both pages consolidate continuous effects into the shared scheduler', async () => {
  const [homepage, archive] = await Promise.all([
    readSource('index.html'),
    readSource('open-source.html'),
  ])

  for (const page of [homepage, archive]) {
    assert.match(page, /assets\/performance\.js/)
    assert.match(page, /createPerformanceProfile/)
    assert.match(page, /createAnimationScheduler/)
  }

  assert.match(homepage, /animationScheduler\.add\(frame\)/)
  assert.match(homepage, /animationScheduler\.add\(draw\)/)
  assert.match(homepage, /animationScheduler\.add\(updateScrollSpeed\)/)
  assert.doesNotMatch(homepage, /requestAnimationFrame\(frame\)/)
  assert.doesNotMatch(homepage, /requestAnimationFrame\(draw\)/)
  assert.doesNotMatch(homepage, /requestAnimationFrame\(pollScroll\)/)
  assert.doesNotMatch(homepage, /requestAnimationFrame\(rafL\)/)
  assert.doesNotMatch(archive, /requestAnimationFrame\(frame\)/)
})

test('production build publishes the performance runtime', async () => {
  const build = await readSource('scripts/build-site.mjs')

  assert.match(build, /assets\/performance\.js/)
})
