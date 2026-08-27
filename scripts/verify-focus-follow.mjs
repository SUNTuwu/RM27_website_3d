import assert from "node:assert/strict";
import * as THREE from "three";

import { createFocusController } from "../src/focus/focusController.js";

const TARGET_SPEED = 5;
const EPSILON = 1e-5;

function verifyMovingTarget(fps) {
  const delta = 1 / fps;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const target = new THREE.Group();
  target.add(new THREE.Mesh(geometry, material));
  scene.add(target);

  const focus = createFocusController({
    camera,
    scene,
    targets: [
      {
        key: "moving-target",
        root: target,
        trackNode: target,
        highlightMaterials: false,
      },
    ],
  });

  let elapsed = 0;
  focus.enter(0, elapsed);
  while (focus.mode === "entering") {
    elapsed += delta;
    target.position.x = elapsed * TARGET_SPEED;
    focus.update(delta, elapsed);
  }
  assert.equal(focus.mode, "active", `${fps} FPS reaches active FOCUS`);

  const handoffCamera = camera.position.clone();
  const handoffAnchor = focus.anchor.clone();
  const handoffOffset = handoffCamera.clone().sub(handoffAnchor);

  elapsed += delta;
  target.position.x = elapsed * TARGET_SPEED;
  focus.update(delta, elapsed);

  const activeOffset = camera.position.clone().sub(focus.anchor);
  assert.ok(
    activeOffset.distanceTo(handoffOffset) <= EPSILON,
    `${fps} FPS preserves the camera offset across entering -> active`,
  );

  const expectedStep = TARGET_SPEED * delta;
  const cameraStep = camera.position.distanceTo(handoffCamera);
  assert.ok(
    Math.abs(cameraStep - expectedStep) <= EPSILON,
    `${fps} FPS camera follows only one frame of target movement at handoff`,
  );

  const viewDirection = camera.getWorldDirection(new THREE.Vector3());
  const anchorDirection = focus.anchor
    .clone()
    .sub(camera.position)
    .normalize();
  assert.ok(
    viewDirection.dot(anchorDirection) >= 1 - EPSILON,
    `${fps} FPS camera looks at the current moving anchor`,
  );

  focus.dispose();
  geometry.dispose();
  material.dispose();
  console.log(`[ok] ${fps} FPS moving FOCUS handoff is continuous`);
}

[60, 30, 15].forEach(verifyMovingTarget);
