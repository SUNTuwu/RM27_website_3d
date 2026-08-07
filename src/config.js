/**
 * 3D 场景常用视觉参数。
 *
 * 修改本文件后由 Vite 自动热更新；生产环境需要重新执行 npm run build。
 * 颜色使用 0xRRGGBB，位置使用 Three.js 的 [x, y, z] 米制坐标。
 */
export const VISUAL_CONFIG = {
  pointCloud: {
    count: 100_000,
    size: 2.1,
    glow: {
      // 点颜色越亮，越容易超过 bloom.threshold 并产生光晕。
      brightnessMin: 0.25,
      brightnessMax: 0.5,
      // 单个点从实心核心到透明边缘的半径，取值范围为 0 到 0.5。
      coreRadius: 0.1,
      edgeRadius: 0.3,
      alphaCutoff: 0.012,
      // alphaCutoff: 0.005,
      // 扫描线经过点云时的额外前沿光晕；颜色为线性 RGB。
      scanColor: [0.45, 0.75, 1.0],
      scanStrength: 0.8,
      scanFalloff: 0.5,
    },
  },

  // UnrealBloomPass 是全场景后处理，也会影响场地红蓝自发光材质。
  bloom: {
    strength: 0.5,
    radius: 0.4,
    threshold: 0.35,
  },

  arena: {
    glow: {
      red: {
        materialPrefix: "EMISSION_RED",
        emissiveIntensityScale: 1,
        light: {
          color: 0xff294d,
          intensity: 14,
          distance: 26,
          decay: 2,
          position: [11, 3, 7],
        },
      },
      blue: {
        materialPrefix: "EMISSION_BLUE",
        emissiveIntensityScale: 1,
        light: {
          color: 0x29b7ff,
          intensity: 18,
          distance: 30,
          decay: 2,
          position: [-10, 4, -8],
        },
      },
      pulse: {
        center: 0.82,
        amplitude: 0.18,
        speed: 1.7,
        phaseStep: 1.3,
      },
    },

    lighting: {
      // 常态场地灯光总亮度；SCAN 时只有红蓝强调灯提升到 scanBrightness。
      brightness: 0.2,
      scanBrightness: 1,
      transitionSpeed: 3,
      environmentIntensity: 1,
      sky: {
        color: 0xc7dcff,
        groundColor: 0x17090b,
        intensity: 1.1,
        position: [0, 18, 0],
      },
      key: {
        color: 0xffffff,
        intensity: 2.1,
        position: [7, 14, 9],
      },
    },
  },

  timeline0: {
    // SCAN 交接时 timeline_0 已提前播放的秒数。
    timeOffsetSeconds: 0.5,
    // SCAN 中相机从 orbit 姿态转向 timeline_0 起点的提前量 (秒): 视角转换比扫描线先开始。
    cameraLeadSeconds: 0.5,
    // Blender 导出的高强度聚光灯运行时缩放，不修改 glTF 源资产。
    lightIntensityScale: 0.0004,
  },
};
