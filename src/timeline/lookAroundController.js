import * as THREE from "three";

const TRANSITION_EPSILON = 0.002;

/**
 * SCRUB 环视子状态机:
 * idle -> entering -> active -> holding -> exiting -> idle
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

  let mode = "idle";
  let dragging = false;
  let yaw = 0;
  let holdRemaining = 0;
  let transitionBlend = 0;

  function captureTransition(nextMode) {
    transitionStartPosition.copy(camera.position);
    transitionStartQuaternion.copy(camera.quaternion);
    transitionBlend = 0;
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
    lookMatrix.lookAt(orbitPosition, orbitPivot, worldUp);
    orbitQuaternion.setFromRotationMatrix(lookMatrix);
  }

  function applyOrbitPose() {
    camera.position.copy(orbitPosition);
    camera.quaternion.copy(orbitQuaternion);
  }

  function beginHolding() {
    holdRemaining = config.holdSeconds;
    mode = "holding";
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
      holdRemaining = 0;
      if (mode === "idle" || mode === "exiting") {
        captureTransition("entering");
      } else if (mode === "holding") {
        mode = "active";
      }
    },
    drag(deltaX) {
      if (!dragging) {
        return;
      }
      yaw = THREE.MathUtils.clamp(
        yaw - deltaX * config.yawSpeed,
        -config.yawRange,
        config.yawRange,
      );
    },
    endDrag() {
      dragging = false;
      if (mode === "active") {
        beginHolding();
      }
    },
    /** 清理环视状态但保留相机当前姿态，供下一个全局状态接管。 */
    reset() {
      mode = "idle";
      dragging = false;
      yaw = 0;
      holdRemaining = 0;
      transitionBlend = 0;
    },
    update(delta, timelinePose) {
      if (mode === "idle") {
        camera.position.copy(timelinePose.position);
        camera.quaternion.copy(timelinePose.quaternion);
        return;
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
            beginHolding();
          }
        }
        return;
      }

      if (mode === "active") {
        computeOrbitPose(timelinePose);
        applyOrbitPose();
        return;
      }

      if (mode === "holding") {
        computeOrbitPose(timelinePose);
        applyOrbitPose();
        holdRemaining = Math.max(holdRemaining - delta, 0);
        if (holdRemaining === 0) {
          captureTransition("exiting");
        }
        return;
      }

      const blend = advanceTransition(delta, config.blendOutSpeed);
      camera.position.lerpVectors(
        transitionStartPosition,
        timelinePose.position,
        blend,
      );
      camera.quaternion.slerpQuaternions(
        transitionStartQuaternion,
        timelinePose.quaternion,
        blend,
      );
      if (blend === 1) {
        mode = "idle";
        yaw = 0;
      }
    },
  };
}
