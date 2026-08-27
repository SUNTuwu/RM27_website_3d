import * as THREE from "three";

const TRANSITION_EPSILON = 0.002;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

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
  let orbitDistance = null;
  let holdRemaining = 0;
  let overviewPinned = false;

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
    if (1 - transitionBlend < TRANSITION_EPSILON) transitionBlend = 1;
    return transitionBlend;
  }

  function prepareReturnTransition(timelinePose) {
    if (transitionDuration > 0) return;
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
    const baseDistance = orbitPosition.distanceTo(orbitPivot);
    const distanceMin = Number.isFinite(config.distanceMin)
      ? config.distanceMin
      : baseDistance;
    const distanceMax = Number.isFinite(config.distanceMax)
      ? config.distanceMax
      : baseDistance;
    if (!Number.isFinite(orbitDistance)) {
      orbitDistance = THREE.MathUtils.clamp(baseDistance, distanceMin, distanceMax);
    }
    orbitPosition
      .sub(orbitPivot)
      .setLength(THREE.MathUtils.clamp(orbitDistance, distanceMin, distanceMax))
      .add(orbitPivot);
    lookMatrix.lookAt(orbitPosition, orbitPivot, worldUp);
    orbitQuaternion.setFromRotationMatrix(lookMatrix);
  }

  function applyOrbitPose() {
    camera.position.copy(orbitPosition);
    camera.quaternion.copy(orbitQuaternion);
  }

  function armHold() {
    holdRemaining = Math.max(config.holdSeconds ?? 2.5, 0);
  }

  function beginHoldOrExit() {
    if (overviewPinned) {
      holdRemaining = Number.POSITIVE_INFINITY;
      mode = "holding";
      return;
    }
    armHold();
    if (holdRemaining > 0) mode = "holding";
    else captureTransition("exiting");
  }

  return {
    get mode() {
      return mode;
    },
    get isIdle() {
      return mode === "idle";
    },
    get distance() {
      return Number.isFinite(orbitDistance)
        ? orbitDistance
        : camera.position.distanceTo(orbitPivot);
    },
    get holdRemaining() {
      return holdRemaining;
    },
    enterOverview() {
      dragging = false;
      yaw = 0;
      orbitDistance = null;
      overviewPinned = true;
      holdRemaining = Number.POSITIVE_INFINITY;
      captureTransition("entering");
    },
    startDrag() {
      dragging = true;
      overviewPinned = false;
      if (mode === "idle" || mode === "exiting") {
        captureTransition("entering");
      } else if (mode === "holding") {
        holdRemaining = 0;
        mode = "active";
      }
    },
    drag(deltaX) {
      if (dragging) yaw += deltaX * config.yawSpeed;
    },
    endDrag() {
      dragging = false;
      if (mode === "active") beginHoldOrExit();
      else if (mode === "entering") armHold();
    },
    zoom(deltaY) {
      if (mode === "idle" || !Number.isFinite(deltaY) || deltaY === 0) {
        return false;
      }
      const distanceMin = Number.isFinite(config.distanceMin)
        ? config.distanceMin
        : 1;
      const distanceMax = Number.isFinite(config.distanceMax)
        ? config.distanceMax
        : Number.POSITIVE_INFINITY;
      const maxWheelDelta = Math.max(config.maxWheelDelta ?? 180, 1);
      const normalizedDelta = THREE.MathUtils.clamp(
        deltaY,
        -maxWheelDelta,
        maxWheelDelta,
      );
      const currentDistance = Number.isFinite(orbitDistance)
        ? orbitDistance
        : THREE.MathUtils.clamp(
            camera.position.distanceTo(orbitPivot),
            distanceMin,
            distanceMax,
          );
      orbitDistance = THREE.MathUtils.clamp(
        currentDistance * Math.exp(normalizedDelta * (config.zoomSpeed ?? 0.0014)),
        distanceMin,
        distanceMax,
      );
      overviewPinned = false;
      if (mode === "exiting") captureTransition("entering");
      armHold();
      return true;
    },
    reset() {
      mode = "idle";
      dragging = false;
      yaw = 0;
      transitionBlend = 0;
      transitionTime = 0;
      transitionDuration = 0;
      orbitDistance = null;
      holdRemaining = 0;
      overviewPinned = false;
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
          if (dragging) mode = "active";
          else beginHoldOrExit();
        }
        return { owner: "lookAround" };
      }
      if (mode === "active") {
        computeOrbitPose(timelinePose);
        applyOrbitPose();
        return { owner: "lookAround" };
      }
      if (mode === "holding") {
        computeOrbitPose(timelinePose);
        applyOrbitPose();
        holdRemaining = Math.max(holdRemaining - delta, 0);
        if (holdRemaining === 0) captureTransition("exiting");
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
        orbitDistance = null;
        holdRemaining = 0;
        overviewPinned = false;
        return { owner: "handoff", finishedThisFrame: true };
      }
      return { owner: "lookAround" };
    },
  };
}
