import * as THREE from "three";

const TRANSITION_EPSILON = 0.002;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * SCRUB 环视子状态机:
 * idle -> entering -> active -> exiting -> idle
 * 所有过渡都从 freeCamera 的当前姿态开始，便于被 FOCUS 等状态无缝接管。
 */
export function createLookAroundController({ camera, pivot, config }) {
  const orbitPivot = pivot.clone();
  const orbitPosition = new THREE.Vector3();
  const orbitQuaternion = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const transitionStartPosition = new THREE.Vector3();
  const transitionStartQuaternion = new THREE.Quaternion();
  const transitionTargetPosition = new THREE.Vector3();
  const transitionTargetQuaternion = new THREE.Quaternion();

  let mode = "idle";
  let dragging = false;
  let yaw = 0;
  let transitionBlend = 0;
  let transitionTime = 0;
  let transitionDuration = 0;

  function captureTransition(nextMode) {
    transitionStartPosition.copy(camera.position);
    transitionStartQuaternion.copy(camera.quaternion);
    transitionBlend = 0;
    transitionTime = 0;
    transitionDuration = 0;
    mode = nextMode;
  }

  function advanceTransition(delta, speed) {
    if (speed <= 0) {
      transitionBlend = 1;
      return transitionBlend;
    }
    transitionBlend +=
      (1 - transitionBlend) * (1 - Math.exp(-delta * speed));
    if (1 - transitionBlend < TRANSITION_EPSILON) {
      transitionBlend = 1;
    }
    return transitionBlend;
  }

  function prepareReturnTransition(timelinePose) {
    if (transitionDuration > 0) {
      return;
    }

    transitionTargetPosition.copy(timelinePose.position);
    transitionTargetQuaternion.copy(timelinePose.quaternion);

    const worldSpeed = Math.max(config.returnWorldSpeed ?? 42, 1);
    const angleSeconds = config.returnAngleSeconds ?? 0.8;
    const minDuration = config.returnDurationMin ?? 0.55;
    const maxDuration = config.returnDurationMax ?? 1.25;
    const distanceSeconds =
      transitionStartPosition.distanceTo(transitionTargetPosition) / worldSpeed;
    const rotationSeconds =
      (transitionStartQuaternion.angleTo(transitionTargetQuaternion) / Math.PI) *
      angleSeconds;

    transitionDuration = THREE.MathUtils.clamp(
      Math.max(distanceSeconds, rotationSeconds, minDuration),
      minDuration,
      maxDuration,
    );
  }

  function computeOrbitPose(timelinePose) {
    const offsetX = timelinePose.position.x - orbitPivot.x;
    const offsetZ = timelinePose.position.z - orbitPivot.z;
    const radius = THREE.MathUtils.clamp(
      Math.hypot(offsetX, offsetZ),
      config.radiusMin,
      config.radiusMax,
    );
    const orbitYaw = Math.atan2(offsetZ, offsetX) + yaw;
    const height =
      radius * Math.tan(THREE.MathUtils.degToRad(config.elevationDeg));

    orbitPosition.set(
      orbitPivot.x + radius * Math.cos(orbitYaw),
      orbitPivot.y + height,
      orbitPivot.z + radius * Math.sin(orbitYaw),
    );
    // 3D 距离约束: 半径钳制只管水平分量, 这里把相机到场地中心的
    // 直线距离也钳制在 [distanceMin, distanceMax], 不管 timeline 相机多远多近
    if (Number.isFinite(config.distanceMin) && Number.isFinite(config.distanceMax)) {
      orbitPosition.sub(orbitPivot);
      const distance = THREE.MathUtils.clamp(
        orbitPosition.length(),
        config.distanceMin,
        config.distanceMax,
      );
      orbitPosition.setLength(distance).add(orbitPivot);
    }
    lookMatrix.lookAt(orbitPosition, orbitPivot, worldUp);
    orbitQuaternion.setFromRotationMatrix(lookMatrix);
  }

  function applyOrbitPose() {
    camera.position.copy(orbitPosition);
    camera.quaternion.copy(orbitQuaternion);
  }

  return {
    get mode() {
      return mode;
    },
    get isIdle() {
      return mode === "idle";
    },
    startDrag() {
      dragging = true;
      if (mode === "idle" || mode === "exiting") {
        captureTransition("entering");
      }
    },
    drag(deltaX) {
      if (!dragging) {
        return;
      }
      // 水平无限制环绕, 方向与 FOCUS 拖拽一致
      yaw += deltaX * config.yawSpeed;
    },
    endDrag() {
      dragging = false;
      if (mode === "active" || mode === "entering") {
        captureTransition("exiting");
      }
    },
    /** 清理环视状态但保留相机当前姿态，供下一个全局状态接管。 */
    reset() {
      mode = "idle";
      dragging = false;
      yaw = 0;
      transitionBlend = 0;
      transitionTime = 0;
      transitionDuration = 0;
    },
    update(delta, timelinePose) {
      if (mode === "idle") {
        camera.position.copy(timelinePose.position);
        camera.quaternion.copy(timelinePose.quaternion);
        return { owner: "timeline" };
      }

      if (mode === "entering") {
        computeOrbitPose(timelinePose);
        const blend = advanceTransition(delta, config.blendInSpeed);
        camera.position.lerpVectors(
          transitionStartPosition,
          orbitPosition,
          blend,
        );
        camera.quaternion.slerpQuaternions(
          transitionStartQuaternion,
          orbitQuaternion,
          blend,
        );
        if (blend === 1) {
          if (dragging) {
            mode = "active";
          } else {
            captureTransition("exiting");
          }
        }
        return { owner: "lookAround" };
      }

      if (mode === "active") {
        computeOrbitPose(timelinePose);
        applyOrbitPose();
        return { owner: "lookAround" };
      }

      prepareReturnTransition(timelinePose);
      transitionTime = Math.min(transitionTime + delta, transitionDuration);
      const blend = easeInOutCubic(
        Math.min(transitionTime / Math.max(transitionDuration, 1e-3), 1),
      );
      camera.position.lerpVectors(
        transitionStartPosition,
        transitionTargetPosition,
        blend,
      );
      camera.quaternion.slerpQuaternions(
        transitionStartQuaternion,
        transitionTargetQuaternion,
        blend,
      );
      if (transitionTime >= transitionDuration) {
        camera.position.copy(transitionTargetPosition);
        camera.quaternion.copy(transitionTargetQuaternion);
        mode = "idle";
        yaw = 0;
        return { owner: "handoff", finishedThisFrame: true };
      }
      return { owner: "lookAround" };
    },
  };
}
