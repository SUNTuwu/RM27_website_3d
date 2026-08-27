import * as THREE from "three";

/**
 * 主时间轴控制器: 滚轮擦洗 timeline_0。
 * 滚轮控制的是进度速度而不是进度数值: 一次滚动给速度一个脉冲,
 * 松手后速度指数衰减回自动播放基线 (autoDrive 开启时) 或 0。
 * FOCUS 期间不调用 update, 时间轴冻结在当前进度 ("timeline_0 动画不变")。
 */
export function createTimelineController({
  root,
  clip,
  camera,
  wheelImpulse = 0.0012,
  maxRate = 0.22,
  velocityDecay = 3,
  autoHoldSeconds = 1.5,
}) {
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(0);

  let progress = 0;
  let velocity = 0; // progress / 秒
  let autoDrive = false;
  let autoHold = 0; // 滚动后自动播放基线的暂停剩余时间
  const autoRate = 1 / clip.duration; // 实时速度自动推进

  const posePosition = new THREE.Vector3();
  const poseQuaternion = new THREE.Quaternion();
  const scratchScale = new THREE.Vector3();

  function applyTime() {
    // action 是 LoopRepeat: time === duration 会回卷到第 0 帧,
    // 满进度时钳在最后一帧之前, 保证尾帧停在最后一帧
    const t = THREE.MathUtils.clamp(progress, 0, 1) * clip.duration;
    mixer.setTime(Math.min(t, clip.duration - 1e-3));
  }

  return {
    clip,
    mixer,
    get progress() {
      return progress;
    },
    get velocity() {
      return velocity;
    },
    get isComplete() {
      return progress >= 0.999 && velocity >= 0;
    },
    addWheel(deltaY) {
      // 滚轮推的是速度: 一次滚动 = 一次速度脉冲, 双向都受 maxRate 限制
      velocity = THREE.MathUtils.clamp(
        velocity + deltaY * wheelImpulse,
        -maxRate,
        maxRate,
      );
      // 滚动期间暂停自动播放基线, 否则回退脉冲会被正向基线立刻吞掉
      autoHold = autoHoldSeconds;
    },
    /** 直接定位到指定进度 (SCAN 期间预推进 / 起始 offset) */
    seekImmediate(value) {
      progress = THREE.MathUtils.clamp(value, 0, 1);
      velocity = 0;
      applyTime();
    },
    /** SCRUB 状态下自动推进进度条; immediate 用于从 SCAN 无减速连续交接 */
    setAutoDrive(value, { immediate = false } = {}) {
      autoDrive = Boolean(value);
      if (!autoDrive) {
        autoHold = 0;
      } else if (immediate) {
        autoHold = 0;
        velocity = autoRate;
      }
    },
    /** paused = 环视中: 速度与进度都冻结, 回中后从冻结处继续 */
    update(delta, paused = false) {
      if (paused) {
        return;
      }
      autoHold = Math.max(autoHold - delta, 0);
      // 速度向基线 (自动播放速度 / 0) 指数衰减; 滚动后基线暂停 autoHoldSeconds
      const baseline = autoDrive && autoHold <= 0 ? autoRate : 0;
      velocity +=
        (baseline - velocity) * (1 - Math.exp(-delta * velocityDecay));
      const next = THREE.MathUtils.clamp(progress + velocity * delta, 0, 1);
      if (next !== progress) {
        progress = next;
        applyTime();
      }
    },
    /** 读取主相机在当前进度的世界姿态 (SCAN 对接目标 / FOCUS 退出回飞终点) */
    readCameraPose() {
      camera.updateWorldMatrix(true, false);
      camera.matrixWorld.decompose(posePosition, poseQuaternion, scratchScale);
      return { position: posePosition, quaternion: poseQuaternion };
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
