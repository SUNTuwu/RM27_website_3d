import * as THREE from "three";

import {
  applyMaterialColor,
  cloneObjectMaterials,
} from "../core/materialVariants.js";

/**
 * 红蓝双方机器人编队:
 * 蓝侧直接使用 glTF 原始场景 (初始摆放位姿已在导出时烘焙进节点);
 * 红侧整体克隆后挂到绕 Y 轴旋转 π 的 teamRoot (与场地 arena 镜像策略一致,
 * 用旋转而不是负 scale, 避免法线/缠绕方向翻转)。
 * 红侧材质独立克隆, EMISSION_BLUE 灯条重着色为红方 EMISSION_RED。
 * 带动画的机器人 (infantry/sentry) 每侧各一个 AnimationMixer 循环播放全部 clip。
 */
export function createRobotSquad(
  robots,
  {
    sourceMaterialPrefix = "EMISSION_BLUE",
    opponentMaterialPrefix = "EMISSION_RED",
    opponentEmissive = 0xff294d,
    scale = 1,
    selfGlowColor = 0xffffff,
    selfGlowIntensity = 0,
  } = {},
) {
  const squadRoot = new THREE.Group();
  squadRoot.name = "robot_squad_root";

  const blueTeamRoot = new THREE.Group();
  blueTeamRoot.name = "robot_squad_blue";
  blueTeamRoot.userData.team = "blue";
  const redTeamRoot = new THREE.Group();
  redTeamRoot.name = "robot_squad_red";
  redTeamRoot.userData.team = "red";
  redTeamRoot.rotation.y = Math.PI;

  const mixers = [];
  const materials = new Set();
  const teamMaterials = { blue: [], red: [] };
  const blueRobots = {};
  const redRobots = {};
  // 带动画机器人的根节点 (FOCUS 光环/命中代理需要每帧跟随其世界位置)
  const trackNodes = { blue: {}, red: {} };

  for (const [key, gltf] of Object.entries(robots)) {
    if (!gltf?.scene) {
      continue;
    }

    const blueScene = gltf.scene;
    // 原地放大: 在顶层节点与网格之间插入 wrapper, 只放大几何;
    // 不动节点自身的 t/r/s — 摆放坐标与动画轨道 (含 scale 轨道) 都不受影响
    if (scale !== 1) {
      blueScene.children.forEach((node) => {
        const wrapper = new THREE.Group();
        wrapper.name = `${node.name}_scale_wrapper`;
        wrapper.scale.setScalar(scale);
        while (node.children.length > 0) {
          wrapper.add(node.children[0]);
        }
        node.add(wrapper);
      });
    }
    blueRobots[key] = blueScene;

    // Object3D.clone 共享几何/贴图/材质, 红蓝两侧不重复占显存
    const redScene = blueScene.clone(true);
    blueScene.name = `${key}_blue`;
    redScene.name = `${key}_red`;

    // 红侧灯条换色: 先独立克隆材质, 再把 EMISSION_BLUE 重着色为红方
    cloneObjectMaterials(redScene);
    const isSourceTeamMaterial = (material) =>
      material.name?.startsWith(sourceMaterialPrefix);
    teamMaterials.blue.push(
      ...applyMaterialColor(blueScene, {
        match: isSourceTeamMaterial,
        userData: { team: "blue" },
      }),
    );
    teamMaterials.red.push(
      ...applyMaterialColor(redScene, {
        match: isSourceTeamMaterial,
        emissive: opponentEmissive,
        rename: (name) =>
          name.replace(sourceMaterialPrefix, opponentMaterialPrefix),
        userData: { team: "red" },
      }),
    );

    blueTeamRoot.add(blueScene);
    redTeamRoot.add(redScene);
    redRobots[key] = redScene;

    // 动画 clip 作用的首个节点 = 运动根节点 (infantry/sentry 会在场地内移动)
    const clips = gltf.animations ?? [];
    const animatedNodeName = clips
      .flatMap((clip) => clip.tracks)
      .map((track) => THREE.PropertyBinding.parseTrackName(track.name).nodeName)
      .find(Boolean);
    if (animatedNodeName) {
      trackNodes.blue[key] = blueScene.getObjectByName(animatedNodeName);
      trackNodes.red[key] = redScene.getObjectByName(animatedNodeName);
    }

    // 材质清单覆盖红蓝两侧 (红侧已克隆, 两侧都接扫描裁剪平面)
    [blueScene, redScene].forEach((scene) => {
      scene.traverse((object) => {
        if (!object.isMesh) {
          return;
        }
        const list = Array.isArray(object.material)
          ? object.material
          : [object.material];
        list.filter(Boolean).forEach((material) => {
          materials.add(material);
          // 白色自发光: 非灯条材质整体提亮, 解决机器人太暗看不清
          if (
            selfGlowIntensity > 0 &&
            !material.name?.startsWith("EMISSION") &&
            material.emissive?.isColor
          ) {
            material.emissive.set(selfGlowColor);
            material.emissiveIntensity = selfGlowIntensity;
          }
        });
      });
    });

    for (const scene of [blueScene, redScene]) {
      if (clips.length === 0) {
        break;
      }
      const mixer = new THREE.AnimationMixer(scene);
      clips.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      });
      mixers.push(mixer);
    }
  }

  squadRoot.add(blueTeamRoot, redTeamRoot);

  return {
    root: squadRoot,
    teamRoots: { blue: blueTeamRoot, red: redTeamRoot },
    blueRobots,
    redRobots,
    trackNodes,
    teamMaterials,
    materials: [...materials],
    mixers,
    update(delta) {
      mixers.forEach((mixer) => mixer.update(delta));
    },
  };
}
