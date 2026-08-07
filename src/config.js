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
    zoom: 1.6, // 点云整体放大倍率 (相机拉近)
    // 左偏构图: 视口水平偏移 = sideOffset * 屏幕宽度 (像素偏移, 非点云位置)
    // 1/6 ≈ 点云中心落在屏幕左 1/3 处; 想更靠左就调大 (如 0.25 → 中心在 25%)
    sideOffset: 1 / 10,
    // 各展示模型的归一化与涟漪参数; 新增机器人模型时在此补一条即可
    // fitScale: 点云最长边 = 场地最长边 * fitScale
    // rippleBoost: 涟漪波速/振幅倍率 (在按模型比例自动缩放的基础上再放大/缩小)
    models: {
      arena: { fitScale: 1, rippleBoost: 1 },
      robot: { fitScale: 0.5, rippleBoost: 2 },
    },
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
    scroll: {
      // 滚轮控制进度速度 (progress/秒), 不是进度数值:
      // 一次滚动 = 一次速度脉冲, 松手后按 velocityDecay 衰减回自动播放速度
      wheelImpulse: 0.0012, // 每单位 deltaY 的速度增量
      maxRate: 0.22, // 速度上限 (双向)
      velocityDecay: 3, // 速度回稳衰减常数 (越大回稳越快)
      autoHoldSeconds: 1.5, // 滚动后自动播放基线的暂停时长 (回退不被自动播放吞掉)
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
