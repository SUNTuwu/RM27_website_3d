/**
 * 3D 场景常用视觉参数。
 *
 * 修改本文件后由 Vite 自动热更新；生产环境需要重新执行 npm run build。
 * 颜色使用 0xRRGGBB，位置使用 Three.js 的 [x, y, z] 米制坐标。
 */
export const VISUAL_CONFIG = {
  // 点云阶段背景装饰环 (仿 Endfield lore 三层结构: 细圆 + 刻度环 + 反向厚弧):
  // ASSEMBLE 渐显进入, 进入 SCAN 渐隐退出, 期间各层缓慢旋转
  backRing: {
    sizeScale: 1.2, // 外径 = 点云包围盒最长边 * sizeScale
    opacity: 0.4,
    tickSpeed: 0.05, // 刻度环角速度 (弧度/秒)
    arcSpeed: -0.035, // 厚弧环角速度 (反向)
    fadeInSeconds: 1.6,
    fadeOutSeconds: 0.9,
    // 绘制参数: 半径均为 0~1 (相对贴图外缘, 1 = 最外圈), 线宽为贴图像素 (1024px 画布)
    solid: {
      radius: 0.75, // 细圆半径
      width: 2, // 细圆线宽
      alpha: 0.55,
    },
    ticks: {
      outer: 0.94, // 刻度外端半径
      length: 0.04, // 刻度长度 (径向)
      width: 2, // 刻度环粗细
      alpha: 0.85,
    },
    arcs: {
      inner: 0.82, // 反向厚弧内径
      outer: 0.88, // 反向厚弧外径
      alpha: 0.2,
    },
  },

  // EXPLORE 环绕视角与多模型切换
  explore: {
    zoom: 1.5, // 点云整体放大倍率 (相机拉近)
    robotFitScale: 0.4, // ROBOT_1 点云最长边 = 场地点云最长边 * 此系数
  },

  pointCloud: {
    count: 50_000,
    size: 2.1,
    glow: {
      // 点颜色越亮，越容易超过 bloom.threshold 并产生光晕。
      brightnessMin: 0.25,
      brightnessMax: 0.5,
      // 单个点从实心核心到透明边缘的半径，取值范围为 0 到 0.5。
      coreRadius: 0.1,
      edgeRadius: 0.2,
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
          intensity: 10,
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
    // 滚轮擦洗惯性: 灵敏度 / progress 追赶速度上限 (每秒) / 自动播放暂停与恢复缓入时长 (秒)
    scroll: {
      wheelScale: 0.00042,
      maxRate: 0.22,
      autoSuspendSeconds: 1.5,
      autoResumeRampSeconds: 0.5,
    },
    // SCRUB 拖拽环视: 拖拽时过渡到绕场地中心斜向下环绕视角, 松手过渡回 timeline 姿态
    lookAround: {
      elevationDeg: 45, // 环绕时斜向下俯角
      yawSpeed: 0.0032, // 水平拖动 -> 环绕角速度 (弧度/像素)
      yawRange: 1.2, // 环绕角度范围 (弧度)
      radiusMin: 12, // 环绕半径下限
      radiusMax: 40, // 环绕半径上限 (半径取 timeline 相机到场地中心的水平距离, 钳制在此区间)
      holdSeconds: 2, // 松手后无输入保持环视的时长, 之后才开始回中
      blendInSpeed: 4, // 拖入环视的过渡速度
      blendOutSpeed: 1.6, // 松手回中的过渡速度
    },
  },
};
