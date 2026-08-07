import * as THREE from "three";

/**
 * 主时间轴控制器: 滚轮擦洗 timeline_0。
 * targetProgress 累积滚轮输入, progress 以最大速率追赶 -> "scroll 速度有最大限制"。
 * FOCUS 期间不调用 update, 时间轴冻结在当前进度 ("timeline_0 动画不变")。
 */
export function createTimelineController({
  root,
  clip,
  camera,
  wheelScale = 0.00042,
  maxRate = 0.22,
}) {
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(0);

  let progress = 0;
  let target = 0;
  let autoDrive = false;
  let autoSuspend = 0;
  const autoRate = 1 / clip.duration; // 实时速度自动推进

  const posePosition = new THREE.Vector3();
  const poseQuaternion = new THREE.Quaternion();
  const scratchScale = new THREE.Vector3();

  function applyTime() {
    mixer.setTime(THREE.MathUtils.clamp(progress, 0, 1) * clip.duration);
  }

  return {
    clip,
    mixer,
    get progress() {
      return progress;
    },
    get target() {
      return target;
    },
    get isComplete() {
      return progress >= 0.999 && target >= 1;
    },
    addWheel(deltaY) {
      target = THREE.MathUtils.clamp(target + deltaY * wheelScale, 0, 1);
      if (deltaY < 0) {
        autoSuspend = 1.5; // 用户主动回滚时暂停自动播放
      }
    },
    /** 直接定位到指定进度 (SCAN 期间预推进 / 起始 offset) */
    seekImmediate(value) {
      progress = THREE.MathUtils.clamp(value, 0, 1);
      target = progress;
      applyTime();
    },
    /** SCRUB 状态下自动推进进度条; 滚轮输入优先 (回滚暂停 1.5s) */
    setAutoDrive(value) {
      autoDrive = Boolean(value);
      if (!autoDrive) {
        autoSuspend = 0;
      }
    },
    /** paused = 拖拽环视中: 自动推进与回滚暂停计时都冻结, 松手恢复 */
    update(delta, paused = false) {
      if (autoDrive && !paused) {
        if (autoSuspend > 0) {
          autoSuspend -= delta;
        } else if (target < 1) {
          target = Math.min(target + autoRate * delta, 1);
        }
      }
      const diff = target - progress;
      if (diff === 0) {
        return;
      }
      const step = THREE.MathUtils.clamp(diff, -maxRate * delta, maxRate * delta);
      progress += step;
      applyTime();
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
