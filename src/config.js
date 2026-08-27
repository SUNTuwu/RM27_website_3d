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
    opacity: 0.2,
    tickSpeed: 0.075, // 刻度环角速度 (弧度/秒)
    arcSpeed: -0.0525, // 厚弧环角速度 (反向)
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
    // EXPLORE 右侧滚动引导: 数道竖直白线依次流星下落 + 竖排英文 落下淡入/停顿/下落淡出, 共用同一周期循环
    scrollCue: {
      cycleSeconds: 8, // 整个周期时长 (秒), 流星与文字动画均以该周期循环
      beginTimeOffsetSeconds: 8, // 进入 EXPLORE 后延迟多久引导才开始出现 (秒), 出现时流星从 0 相位开始下落
      rightVw: 25.0, // 距视口右侧的位置 (vw), 33.3 ≈ 屏幕右侧 1/3 处, 线条自顶部垂下
      lineWidthPx: 3, // 竖直白线宽度 (px)
      lineOpacity: 0.0, // 竖直白线透明度 (0~1), 流星拖尾不受影响
      lineCount: 3, // 竖直白线数量
      lengthDecay: 0.82, // 相邻白线长度比例 (0~1), 左长右短逐渐变短; 1 = 等长
      staggerSeconds: 0.5, // 相邻白线流星开始下落的间隔 (秒), 营造依次下落的韵律
      meteorDurationSeconds: 2.5, // 单条流星从线顶落到线尾的时长 (秒), 加速下落
      meteorLengthPx: 200, // 流星拖尾长度 (px)
      text: "SCROLL TO INITIATE SCAN", // 竖排引导文字
      textFontSizePx: 18, // 引导文字字号 (px)
      textTopOffsetPx: 60, // 文字静止位置相对容器顶部的下移距离 (px)
      textDelaySeconds: 1.5, // 文字相对周期起点的延迟 (秒), 比流星慢一拍
      textFadeInSeconds: 1.2, // 文字自上方落下并淡入的时长 (秒)
      textHoldSeconds: 3.0, // 淡入结束后的停顿时长 (秒)
      textFadeOutSeconds: 0.9, // 文字向下移动并淡出的时长 (秒)
      textDropInPx: 56, // 淡入起始位置的向上偏移 (px)
      textDropOutPx: 88, // 淡出结束位置的向下偏移 (px)
    },

    cameraFov: 103.37, // 与 timeline_0 导出相机一致, 避免后台相机就绪时构图跳变
    zoom: 1.6, // 点云整体放大倍率 (相机拉近)
    initialPitchDeg: 10, // 初始摄像机俯角 (度, 相对水平面向下)
    autoRotateSpeed: 0.1, // 点云常态旋转速度 (弧度/秒, 实际由相机环绕实现)
    brandMark: {
      opacity: 0.15, // ASSEMBLE / EXPLORE 右侧 ENTERPRIZE 品牌图透明度 (0~1)
      colors: {
        start: "#ff2d4c6d", // 渐变起始色
        middle: "#9c9ae586", // 渐变中间色
        end: "#c3d7fcff", // 渐变结束色; 三项设为相同值可显示纯色
      },
      position: {
        rightVw: -18.0, // 距视口右侧的位置 (vw, 可设负值让背景超出画面)
        topVh: 80, // 图片中心的垂直位置 (vh)
      },
      size: {
        widthVw: 60, // 首选宽度 (vw)
        minWidthPx: 600, // 最小宽度 (px)
        maxWidthPx: 1040, // 最大宽度 (px)
        maxHeightVh: 120, // 最大高度 (vh)
      },
      rhythm: {
        gradientAngleDeg: -45, // 红蓝渐变角度; 135deg 对应左上/右下 45° 斜向
        durationSeconds: 3.2, // 单次向左上律动周期 (秒)
      },
    },
    // 左偏构图: 视口水平偏移 = sideOffset * 屏幕宽度 (像素偏移, 非点云位置)
    // 1/6 ≈ 点云中心落在屏幕左 1/3 处; 想更靠左就调大 (如 0.25 → 中心在 25%)
    sideOffset: 1 / 10,
    // 上下偏移: 视口垂直偏移 = verticalOffset * 屏幕高度, 正值向下挪, 负值向上
    // 1/10 = 点云中心从屏幕中央 (50%) 下移到 60% 高度处
    verticalOffset: 1 / 30,
    // 点击引导圈: EXPLORE 无点击 idleSeconds 秒后出现, 跟随点云中心屏幕投影
    clickGuide: {
      idleSeconds: 5, // 无点击多少秒后显示
      sizePx: 120, // 外圈直径 (px)
      rhythmSeconds: 1.6, // 单次收缩律动周期 (秒)
      fadeSeconds: 0.45, // 出现/消失淡入淡出时长 (秒)
    },
    // 各展示模型的归一化与涟漪参数; 新增机器人模型时在此补一条即可
    // fitScale: 点云最长边 = 场地最长边 * fitScale
    // rippleBoost: 涟漪波速/振幅倍率 (在按模型比例自动缩放的基础上再放大/缩小)
    models: {
      arena: { fitScale: 1, rippleBoost: 1 },
      dart: { fitScale: 0.7, rippleBoost: 2 },
      infantry: { fitScale: 0.8, rippleBoost: 1 },
      engineer: { fitScale: 0.8, rippleBoost: 1 },
    },
    // 切换动效: 双模型同步快速自转, 使用自下而上的屏幕空间蒙版交接
    switchTransition: {
      duration: 2.0, // 过渡总时长 (秒)
      spinTurns: 0.5, // 两个模型同步自转圈数
      spinCompleteAt: 0.6, // 旋转在过渡进度达到该比例时完成
      ringSpeedMultiplier: 40, // 切换旋转中点时背景环的峰值速度倍率
      maskFeather: 0.03, // 屏幕高度归一化后的蒙版柔边宽度
      maskGlowStrength: 2.5, // 蒙版边缘白色 HDR 高亮强度，由 Bloom 扩散成光晕
    },
    // SCRUB 回滚到时间轴起点时: 继续上滚渐隐黑场, 从点云聚拢前重新加载 EXPLORE
    reloadFromStart: {
      progressThreshold: 0.003, // 时间轴进度 <= 该值时触发 (0~1)
      fadeOutSeconds: 0.45, // 场景 -> 黑场时长 (秒)
      fadeInSeconds: 0.7, // 黑场 -> 重新聚拢动画时长 (秒)
    },
  },

  // FOCUS 兵种聚焦视角。触屏端拉远一些并扩大命中代理，给底部媒体带留出构图空间。
  focus: {
    distanceRatio: 1.2,
    mobileDistanceRatio: 1.55,
    hitRadiusScale: 1.25,
    mobileHitRadiusScale: 1.7,
    hitHeightScale: 2,
    mobileHitHeightScale: 2.4,
  },

  // 红蓝编队机器人 (hero/engineer/infantry/sentry, robots/robotSquad.js)
  robots: {
    scale: 1.4, // 原地放大倍率 (插入 scale wrapper, 不影响摆放坐标与动画轨道)
    selfGlowColor: 0xffffff, // 机身白色自发光 (非灯条材质), 解决太暗看不清
    selfGlowIntensity: 0.14, // 自发光强度 (0 关闭; 过大会洗掉机身贴图)
  },

  pointCloud: {
    count: 50_000,
    size: 2.2,
    glow: {
      // 点颜色越亮，越容易超过 bloom.threshold 并产生光晕。
      brightnessMin: 0.2,
      brightnessMax: 0.7,
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
    strength: 0.1,
    radius: 0.2,
    threshold: 0.25,
  },

  arena: {
    symmetry: {
      // Blender 的 Z-up 导出为 glTF 后已转换成 Three.js 的 Y-up。
      rotationAxis: "y",
      rotationRadians: Math.PI,
      sourceMaterialPrefix: "EMISSION_BLUE",
      opponentMaterialPrefix: "EMISSION_RED",
      opponentEmissive: 0xff294d,
    },
    glow: {
      red: {
        materialPrefix: "EMISSION_RED",
        emissiveIntensityScale: 1,
        light: {
          color: 0xff294d,
          intensity: 10,
          distance: 26,
          decay: 2,
          position: [-11, 3, 7],
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
          position: [10, 4, -8],
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
      brightness: 0.1,
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
    // SCAN 结束前多少秒启动 timeline_0；启动后始终按 1x 连续播放。
    animateTimeOffset: 2.0,
    // 相对于上述提前播放起点的相机接轨时刻；应不大于 animateTimeOffset。
    cameraTimeOffset: 0.5,
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
    // SCRUB 横向拖拽进入环视；松手停留后返回冻结的时间轴相机。
    lookAround: {
      elevationDeg: 45,
      yawSpeed: 0.0032,
      mobileYawSpeed: 0.004,
      radiusMin: 12,
      radiusMax: 40,
      distanceMin: 8,
      distanceMax: 36,
      zoomSpeed: 0.0014,
      maxWheelDelta: 180,
      blendInSpeed: 4,
      holdSeconds: 2.5,
      returnDurationMin: 0.55,
      returnDurationMax: 1.25,
      returnWorldSpeed: 42,
      returnAngleSeconds: 0.8,
    },
  },
};
