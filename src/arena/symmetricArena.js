import * as THREE from "three";

import {
  applyMaterialColor,
  collectMaterials,
  cloneObjectMaterials,
} from "../core/materialVariants.js";

const ROTATION_PROPERTIES = Object.freeze({ x: "x", y: "y", z: "z" });

function createTeamRoot(team) {
  const root = new THREE.Group();
  root.name = `arena_team_${team}`;
  root.userData.team = team;
  return root;
}

function tagMaterials(root, team, match) {
  return applyMaterialColor(root, {
    match,
    userData: { team },
  });
}

export function createSymmetricArena(
  source,
  {
    rotationAxis = "y",
    rotationRadians = Math.PI,
    sourceMaterialPrefix = "EMISSION_BLUE",
    opponentMaterialPrefix = "EMISSION_RED",
    opponentEmissive = 0xff294d,
  } = {},
) {
  const rotationProperty = ROTATION_PROPERTIES[rotationAxis];
  if (!rotationProperty) {
    throw new Error(`Unsupported arena symmetry axis: ${rotationAxis}`);
  }

  const arenaRoot = new THREE.Group();
  arenaRoot.name = "arena_full_root";
  arenaRoot.userData.symmetryAxis = rotationAxis;
  arenaRoot.userData.symmetryRadians = rotationRadians;

  const blueTeamRoot = createTeamRoot("blue");
  const redTeamRoot = createTeamRoot("red");
  redTeamRoot.rotation[rotationProperty] = rotationRadians;

  const blueHalf = source.scene;
  const redHalf = source.scene.clone(true);
  blueHalf.name = "arena_blue_half";
  redHalf.name = "arena_red_half";

  // Object3D.clone keeps geometry, textures, and materials shared. Only materials
  // are detached before recoloring so the blue half remains unchanged.
  cloneObjectMaterials(redHalf);
  const blueSceneMaterials = collectMaterials(blueHalf);
  const redSceneMaterials = collectMaterials(redHalf);
  const isSourceTeamMaterial = (material) =>
    material.name?.startsWith(sourceMaterialPrefix);
  const blueMaterials = tagMaterials(blueHalf, "blue", isSourceTeamMaterial);
  const redMaterials = applyMaterialColor(redHalf, {
    match: isSourceTeamMaterial,
    emissive: opponentEmissive,
    rename: (name) => name.replace(sourceMaterialPrefix, opponentMaterialPrefix),
    userData: { team: "red" },
  });

  if (blueMaterials.length === 0 || redMaterials.length === 0) {
    throw new Error(
      `Arena team material prefix was not found: ${sourceMaterialPrefix}`,
    );
  }

  blueTeamRoot.add(blueHalf);
  redTeamRoot.add(redHalf);
  arenaRoot.add(blueTeamRoot, redTeamRoot);

  const clips = source.animations ?? [];
  const animatedNodeName = clips
    .flatMap((clip) => clip.tracks)
    .map((track) => THREE.PropertyBinding.parseTrackName(track.name).nodeName)
    .find(Boolean);
  const mixers = [blueTeamRoot, redTeamRoot].map((teamRoot) => {
    const mixer = new THREE.AnimationMixer(teamRoot);
    clips.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    });
    return mixer;
  });

  const blueGeometries = new Set();
  blueHalf.traverse((object) => {
    if (object.isMesh) {
      blueGeometries.add(object.geometry);
    }
  });
  let redMeshCount = 0;
  let sharedGeometryCount = 0;
  redHalf.traverse((object) => {
    if (object.isMesh) {
      redMeshCount += 1;
      if (blueGeometries.has(object.geometry)) {
        sharedGeometryCount += 1;
      }
    }
  });
  const textureSlots = [
    "map",
    "emissiveMap",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "alphaMap",
  ];
  const texturesShared = redSceneMaterials.every((redMaterial, index) => {
    const blueMaterial = blueSceneMaterials[index];
    return (
      blueMaterial &&
      textureSlots.every((slot) => redMaterial[slot] === blueMaterial[slot])
    );
  });

  return {
    asset: { ...source, scene: arenaRoot },
    root: arenaRoot,
    teamRoots: { blue: blueTeamRoot, red: redTeamRoot },
    teamMaterials: { blue: blueMaterials, red: redMaterials },
    mixers,
    update(delta) {
      mixers.forEach((mixer) => mixer.update(delta));
    },
    getDebugState() {
      const animatedPoses = [blueTeamRoot, redTeamRoot].map((teamRoot) => {
        const node = animatedNodeName
          ? teamRoot.getObjectByName(animatedNodeName)
          : null;
        if (!node) {
          return null;
        }
        node.updateWorldMatrix(true, false);
        return {
          position: node.position.toArray(),
          quaternion: node.quaternion.toArray(),
          worldPosition: node.getWorldPosition(new THREE.Vector3()).toArray(),
        };
      });
      return {
        halfCount: arenaRoot.children.length,
        rotationAxis,
        rotationRadians,
        mixerCount: mixers.length,
        mixerTimes: mixers.map((mixer) => mixer.time),
        animatedNodeName,
        animatedPoses,
        blueMaterialCount: blueMaterials.length,
        redMaterialCount: redMaterials.length,
        redMaterialNames: redMaterials.map((material) => material.name),
        redEmissiveHexes: redMaterials.map((material) =>
          material.emissive.getHexString(),
        ),
        materialsIndependent: redSceneMaterials.every(
          (material) => !blueSceneMaterials.includes(material),
        ),
        texturesShared,
        geometryShared:
          redMeshCount > 0 && sharedGeometryCount === redMeshCount,
      };
    },
  };
}
