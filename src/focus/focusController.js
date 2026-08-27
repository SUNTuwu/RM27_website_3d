import * as THREE from "three";

const ENTER_DURATION = 1.15;
const EXIT_DURATION = 1.0;
const FOCUS_HEIGHT = 0.9;
const RECENTER_RATE = 1.4; // 松手慢速回中速率
const DRAG_SPEED = 0.0052;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * 兵种聚焦状态 (FOCUS), 支持多个机器人目标 (红蓝编队机器人):
 * enter(i) -> 相机从当前姿态 tween 到目标 i 旁锚点
 * active   -> 拖拽围绕机器人观察, 松手弹簧回中
 * exit     -> 相机 tween 回 timeline_0 冻结进度的相机姿态
 * 每个目标有独立的地面光环 (SCRUB 中脉冲高亮) 与点击命中代理 (按包围盒自适应)。
 */
export function createFocusController({
  camera,
  targets,
  scene,
  distanceRatio = 1.2,
}) {
  const targetStates = targets.map((target, index) => {
    // 更新祖先矩阵 (红侧 teamRoot 带 π 旋转), 否则包围盒用旧矩阵计算
    target.root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(target.root);
    const anchor = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, 0.4);
    const anchorBaseY = anchor.y;

    // 地面光环 (高亮提示)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.72, radius * 0.98, 64),
      new THREE.MeshBasicMaterial({
        color: target.ringColor ?? 0x2e9bff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.name = `robot_focus_ring_${target.key}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(anchor.x, 0.035, anchor.z);
    ring.renderOrder = 5;
    scene.add(ring);

    // 点击命中代理 (隐形圆柱放大命中区域, 尺寸随机器人包围盒自适应)
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(
        radius * 1.25,
        radius * 1.25,
        Math.max(size.y * 2, 1.2),
        12,
      ),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.name = `robot_focus_proxy_${target.key}`;
    proxy.userData.focusTargetIndex = index;
    proxy.position.copy(anchor);
    scene.add(proxy);

    // 机器人自发光高亮 (可选: 编队机器人有常亮白色自发光, 不再覆盖)
    const materials = new Set();
    target.root.traverse((object) => {
      if (!object.isMesh) {
        return;
      }
      const list = Array.isArray(object.material)
        ? object.material
        : [object.material];
      list.filter(Boolean).forEach((material) => materials.add(material));
    });
    const highlightMaterials = target.highlightMaterials !== false;
    if (highlightMaterials) {
      materials.forEach((material) => {
        material.emissive.set(0x2e9bff);
        material.emissiveIntensity = 0;
      });
    }

    return {
      target,
      anchor,
      anchorBaseY,
      ring,
      proxy,
      materials,
      highlightMaterials,
      distance: Math.max(radius * distanceRatio, 0.6),
    };
  });

  let activeIndex = 0;
  const trackWorldPos = new THREE.Vector3();

  const startPos = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  const endPos = new THREE.Vector3();
  const endQuat = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const horizontal = new THREE.Vector3();
  const pitchAxis = new THREE.Vector3();

  // 聚焦观察偏移 (以机器人为原点的相机偏移量)
  const restOffset = new THREE.Vector3();
  const currentOffset = new THREE.Vector3();

  let mode = "idle"; // idle | entering | active | exiting
  let modeTime = 0;
  let modeStartedAt = null;
  let dragging = false;
  let highlight = 0;
  let highlightTarget = 0;
  let modeChangeCallback = null;

  function computeAnchorPose() {
    const state = targetStates[activeIndex];
    horizontal.copy(camera.position).sub(state.anchor);
    horizontal.y = 0;
    if (horizontal.lengthSq() < 1e-4) {
      horizontal.set(0, 0, 1);
    }
    horizontal.normalize();
    endPos
      .copy(state.anchor)
      .addScaledVector(horizontal, state.distance)
      .add(new THREE.Vector3(0, FOCUS_HEIGHT, 0));
    lookMatrix.lookAt(endPos, state.anchor, up);
    endQuat.setFromRotationMatrix(lookMatrix);
  }

  return {
    get anchor() {
      return targetStates[activeIndex].anchor;
    },
    get anchors() {
      return targetStates.map((state) => state.anchor);
    },
    get proxies() {
      return targetStates.map((state) => state.proxy);
    },
    get activeIndex() {
      return activeIndex;
    },
    get mode() {
      return mode;
    },
    setOnModeChange(callback) {
      modeChangeCallback = callback;
    },
    /** 进入聚焦: 捕获自由相机当前姿态，并以此作为过渡起点 */
    enter(index, startedAt) {
      activeIndex = THREE.MathUtils.clamp(index, 0, targetStates.length - 1);
      computeAnchorPose();
      startPos.copy(camera.position);
      startQuat.copy(camera.quaternion);
      restOffset.copy(endPos).sub(targetStates[activeIndex].anchor);
      currentOffset.copy(restOffset);
      mode = "entering";
      modeTime = 0;
      modeStartedAt = Number.isFinite(startedAt) ? startedAt : null;
    },
    /** 退出聚焦: targetPose = timeline_0 冻结进度的相机姿态 */
    exit(targetPose, startedAt) {
      startPos.copy(camera.position);
      startQuat.copy(camera.quaternion);
      endPos.copy(targetPose.position);
      endQuat.copy(targetPose.quaternion);
      dragging = false;
      mode = "exiting";
      modeTime = 0;
      modeStartedAt = Number.isFinite(startedAt) ? startedAt : null;
    },
    startDrag() {
      if (mode === "active") {
        dragging = true;
      }
    },
    drag(dx, dy) {
      if (mode !== "active" || !dragging) {
        return;
      }
      currentOffset.applyAxisAngle(up, -dx * DRAG_SPEED);
      pitchAxis.crossVectors(up, currentOffset).normalize();
      currentOffset.applyAxisAngle(pitchAxis, -dy * DRAG_SPEED);
      // 俯仰角限制: 不允许钻到地下或翻到正顶
      const ratio = currentOffset.y / currentOffset.length();
      if (ratio < -0.05 || ratio > 0.85) {
        pitchAxis.crossVectors(up, currentOffset).normalize();
        currentOffset.applyAxisAngle(pitchAxis, dy * DRAG_SPEED);
      }
    },
    endDrag() {
      dragging = false;
    },
    /** 高亮强度目标值 (SCRUB/FOCUS/END = 1, 其余 = 0), 内部平滑过渡 */
    setHighlightTarget(value) {
      highlightTarget = value;
    },
    update(delta, elapsed) {
      highlight += (highlightTarget - highlight) * (1 - Math.exp(-delta * 4));
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.2);
      targetStates.forEach((state) => {
        // 带动画的机器人 (infantry/sentry) 会在场地内移动: 光环/代理/锚点跟随根节点
        if (state.target.trackNode) {
          state.target.trackNode.getWorldPosition(trackWorldPos);
          state.anchor.set(trackWorldPos.x, state.anchorBaseY, trackWorldPos.z);
          state.ring.position.set(trackWorldPos.x, 0.035, trackWorldPos.z);
          state.proxy.position.copy(state.anchor);
        }
        state.ring.material.opacity = highlight * (0.15 + 0.15 * pulse); // 光环降低 50%
        state.ring.scale.setScalar(1 + 0.08 * pulse);
        if (state.highlightMaterials) {
          state.materials.forEach((material) => {
            material.emissiveIntensity =
              highlight * (0.35 + 0.45 * pulse); // 高亮降低 50%
          });
        }
      });

      const active = targetStates[activeIndex];

      if (mode === "entering" || mode === "exiting") {
        modeTime += delta;
        if (Number.isFinite(elapsed) && modeStartedAt === null) {
          modeStartedAt = elapsed;
        }
        const transitionTime = Number.isFinite(elapsed) && modeStartedAt !== null
          ? Math.max(elapsed - modeStartedAt, 0)
          : modeTime;
        const duration = mode === "entering" ? ENTER_DURATION : EXIT_DURATION;
        const k = easeInOutCubic(Math.min(transitionTime / duration, 1));
        camera.position.lerpVectors(startPos, endPos, k);
        camera.quaternion.slerpQuaternions(startQuat, endQuat, k);
        if (transitionTime >= duration) {
          const finished = mode;
          mode = mode === "entering" ? "active" : "idle";
          modeStartedAt = null;
          modeChangeCallback?.(mode, finished);
        }
        return;
      }

      if (mode === "active") {
        if (!dragging) {
          // 松手慢速回中
          currentOffset.lerp(restOffset, 1 - Math.exp(-delta * RECENTER_RATE));
        }
        camera.position.copy(active.anchor).add(currentOffset);
        camera.lookAt(active.anchor);
      }
    },
    dispose() {
      targetStates.forEach((state) => {
        scene.remove(state.ring);
        scene.remove(state.proxy);
        state.ring.geometry.dispose();
        state.ring.material.dispose();
        state.proxy.geometry.dispose();
        state.proxy.material.dispose();
      });
    },
  };
}
