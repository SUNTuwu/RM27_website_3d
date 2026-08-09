(function (global) {
  'use strict';

  var MOBILE_BREAKPOINT = 720;
  var LOW_CORE_THRESHOLD = 4;
  var LOW_MEMORY_THRESHOLD = 4;
  var schedulers = Object.freeze([]);

  function finiteNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function createPerformanceProfile(options) {
    var settings = options || {};
    var width = finiteNumber(settings.width, global.innerWidth || 1280);
    var devicePixelRatio = finiteNumber(settings.devicePixelRatio, global.devicePixelRatio || 1);
    var hardwareConcurrency = finiteNumber(settings.hardwareConcurrency, global.navigator && global.navigator.hardwareConcurrency);
    var deviceMemory = finiteNumber(settings.deviceMemory, global.navigator && global.navigator.deviceMemory);
    var coarsePointer = settings.coarsePointer;
    if (typeof coarsePointer !== 'boolean') {
      coarsePointer = Boolean(global.matchMedia && global.matchMedia('(hover: none), (pointer: coarse)').matches);
    }
    var isMobile = width <= MOBILE_BREAKPOINT || coarsePointer;
    var isLowPower = Boolean(
      (hardwareConcurrency && hardwareConcurrency <= LOW_CORE_THRESHOLD) ||
      (deviceMemory && deviceMemory <= LOW_MEMORY_THRESHOLD)
    );
    var isReduced = Boolean(settings.reducedMotion);
    var particleScale = isReduced ? 0 : isMobile ? 0.55 : isLowPower ? 0.7 : 1;
    var pixelRatioCap = isReduced || isMobile || isLowPower ? 1 : 1.5;
    var pixelBudgetRatio = Math.sqrt(3000000 / Math.max(width * finiteNumber(settings.height, global.innerHeight || 900), 1));

    return Object.freeze({
      surface: settings.surface || 'home',
      tier: isReduced ? 'reduced' : isMobile ? 'mobile' : isLowPower ? 'balanced' : 'full',
      isMobile: isMobile,
      isLowPower: isLowPower,
      reducedMotion: isReduced,
      targetFps: isReduced ? 0 : isMobile || isLowPower ? 30 : 60,
      pixelRatio: Math.min(Math.max(devicePixelRatio, 1), pixelRatioCap, pixelBudgetRatio),
      particleScale: particleScale,
      enableWebGL: !isReduced,
      enableMouseWarp: !isReduced && !isMobile && !isLowPower,
      enableNebula: !isReduced,
      enableHoloLighting: !isReduced && !isMobile && !isLowPower,
      enableSmoothScroll: !isReduced && !isMobile && !isLowPower,
      enableScrollAnimations: !isReduced && !isMobile && !isLowPower,
    });
  }

  function createAnimationScheduler(options) {
    var settings = options || {};
    var targetFps = Math.max(1, finiteNumber(settings.targetFps, 60));
    var frameInterval = 1000 / targetFps;
    var requestFrame = settings.requestFrame || global.requestAnimationFrame.bind(global);
    var cancelFrame = settings.cancelFrame || global.cancelAnimationFrame.bind(global);
    var documentSource = settings.documentSource || global.document;
    var callbacks = Object.freeze([]);
    var state = Object.freeze({
      isRunning: false,
      hasStarted: false,
      frameId: null,
      lastFrameTime: 0,
      lastTickTime: 0,
      accumulatedTime: 0,
      tickCount: 0,
    });

    function replaceState(changes) {
      state = Object.freeze(Object.assign({}, state, changes));
    }

    function schedule() {
      if (!state.isRunning || state.frameId !== null) return;
      replaceState({ frameId: requestFrame(runFrame) });
    }

    function runFrame(timestamp) {
      replaceState({ frameId: null });
      if (!state.isRunning) return;

      var elapsed = state.lastFrameTime ? timestamp - state.lastFrameTime : frameInterval;
      var accumulatedTime = Math.min(state.accumulatedTime + elapsed, frameInterval * 3);
      replaceState({ lastFrameTime: timestamp, accumulatedTime: accumulatedTime });
      if (accumulatedTime >= frameInterval) {
        var deliveredTime = state.lastTickTime ? timestamp - state.lastTickTime : frameInterval;
        var delta = Math.min(Math.max(deliveredTime / 16.667, 0.25), 3);
        replaceState({
          lastTickTime: timestamp,
          accumulatedTime: Math.max(0, accumulatedTime % frameInterval),
          tickCount: state.tickCount + 1,
        });
        callbacks.forEach(function (callback) {
          try {
            callback(timestamp, delta);
          } catch (error) {
            global.setTimeout(function () { throw error; }, 0);
          }
        });
      }
      schedule();
    }

    function start() {
      if (state.isRunning) return;
      if (documentSource && documentSource.hidden) {
        replaceState({ hasStarted: true, lastFrameTime: 0, lastTickTime: 0, accumulatedTime: 0 });
        return;
      }
      replaceState({ isRunning: true, hasStarted: true, lastFrameTime: 0, lastTickTime: 0, accumulatedTime: 0 });
      schedule();
    }

    function pause() {
      if (!state.isRunning) return;
      if (state.frameId !== null) cancelFrame(state.frameId);
      replaceState({ isRunning: false, frameId: null, lastFrameTime: 0, lastTickTime: 0, accumulatedTime: 0 });
    }

    function setTargetFps(nextTargetFps) {
      targetFps = Math.max(1, finiteNumber(nextTargetFps, targetFps));
      frameInterval = 1000 / targetFps;
      replaceState({ lastFrameTime: 0, lastTickTime: 0, accumulatedTime: 0 });
    }

    function add(callback) {
      if (typeof callback !== 'function') throw new TypeError('Animation callback must be a function.');
      callbacks = Object.freeze(callbacks.concat(callback));
      return function remove() {
        callbacks = Object.freeze(callbacks.filter(function (item) { return item !== callback; }));
      };
    }

    function handleVisibility() {
      if (documentSource && documentSource.hidden) pause();
      else if (state.hasStarted) start();
    }

    if (documentSource && documentSource.addEventListener) {
      documentSource.addEventListener('visibilitychange', handleVisibility);
    }
    if (global.addEventListener) {
      global.addEventListener('pagehide', pause);
      global.addEventListener('pageshow', handleVisibility);
    }

    var scheduler = Object.freeze({
      add: add,
      start: start,
      pause: pause,
      resume: start,
      setTargetFps: setTargetFps,
      getSnapshot: function () {
        return Object.freeze({
          isRunning: state.isRunning,
          pendingFrameCount: state.frameId === null ? 0 : 1,
          tickCount: state.tickCount,
          callbackCount: callbacks.length,
          targetFps: targetFps,
        });
      },
    });
    schedulers = Object.freeze(schedulers.concat(scheduler));
    return scheduler;
  }

  global.ENTERPRIZE_PERFORMANCE = Object.freeze({
    createPerformanceProfile: createPerformanceProfile,
    createAnimationScheduler: createAnimationScheduler,
    getSchedulerSnapshots: function () {
      return Object.freeze(schedulers.map(function (scheduler) { return scheduler.getSnapshot(); }));
    },
  });
})(window);
