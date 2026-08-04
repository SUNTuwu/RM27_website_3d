(function () {
  'use strict';

  function freezeItems(items) {
    return Object.freeze(items.map(function (item) {
      return Object.freeze(item);
    }));
  }

  window.ENTERPRIZE_RECRUITMENT = Object.freeze({
    season: 'RM2027',
    status: '筹备中',
    badge: 'RM2027 RECRUITMENT · STANDBY',
    primaryCta: Object.freeze({
      label: '获取开招提醒 ⟶',
      href: '#interest-actions',
    }),
    statusTitle: 'RM2027 招新状态：筹备中',
    statusMessage: '正式报名表、宣讲与面试时间尚未公布。现在可以加入 QQ 招新群或发送邮件，先了解方向、培训安排和开招提醒。',
    scheduleNote: '时间线参考往年节奏：招新约 9–10 月、RDC 约 11 月、联盟赛通常在次年春季。RM2027 的具体安排以公众号通知为准；具备相关经验者可在报名时附上项目经历。',
    contacts: Object.freeze({
      qqGroup: '581184202',
      email: 'robomasterhkust@gmail.com',
      emailSubject: 'RM2027 招新咨询',
    }),
    departments: freezeItems([
      {
        id: 'mechanical',
        name: '机械部',
        english: 'Mechanical',
        tone: 'var(--gold)',
        titleTone: 'var(--gold2)',
        planetClass: 'p-mech',
        responsibility: '为英雄、工程、步兵等机器人设计底盘、云台、机械臂、传动与轴系。',
        technologies: 'SolidWorks 三维建模、3D 打印、CNC 加工、装配与测试。',
        growth: '从需求拆解、采购到设计评审和赛场迭代，完成一套机械产品研发闭环。',
        project: '轮腿步兵、舵轮英雄与轮式机械臂工程机器人。',
      },
      {
        id: 'hardware',
        name: '硬件部',
        english: 'Hardware',
        tone: 'var(--green)',
        titleTone: 'var(--green)',
        planetClass: 'p-hw',
        responsibility: '设计、构建并维护全队电子系统、传感器接口与供电网络。',
        technologies: 'KiCad PCB 设计、元器件选型、电源拓扑、焊接、调试与维护。',
        growth: '从原理图和 Layout 入门，逐步独立完成可以通过整机联调与比赛检验的板卡。',
        project: 'G4 主控板、超级电容功率控制板与无线充电系统。',
      },
      {
        id: 'embedded-control',
        name: '电控部',
        english: 'Embedded Control',
        tone: 'var(--pink)',
        titleTone: 'var(--pink)',
        planetClass: 'p-ec',
        responsibility: '开发底层驱动和控制逻辑，完成整机联调并保障赛场级稳定性。',
        technologies: 'C/C++、STM32、PID/LQR、CAN 总线、DJI 电机、滤波器与 FreeRTOS。',
        growth: '从单个执行器控制走向多模块协作、故障定位和完整机器人状态管理。',
        project: '轮腿平衡、舵轮底盘、云台与机械臂控制系统。',
      },
      {
        id: 'algorithm',
        name: '算法部',
        english: 'Algorithm & Vision',
        tone: 'var(--cyan)',
        titleTone: 'var(--cyan2)',
        planetClass: 'p-alg',
        responsibility: '处理相机与激光雷达数据，让机器人完成识别、定位、追踪和自主决策。',
        technologies: 'OpenCV、YOLO、卡尔曼滤波、TensorRT、ROS 与三维几何。',
        growth: '从数据标注和算法验证入门，逐步完成部署、系统联调和赛场指标复盘。',
        project: '自动瞄准、全自动哨兵、智能导航与单目雷达站。',
      },
    ]),
    path: freezeItems([
      {
        title: '获取开招提醒',
        phase: 'STANDBY · 现在',
        description: '关注公众号、加入 QQ 招新群或发送邮件；正式安排发布后，从任一官方渠道获取报名入口。',
      },
      {
        title: '报名与选择方向',
        phase: 'APPLICATION · 约 9–10 月',
        description: '填写基本信息和可投入时间，结合兴趣选择机械、硬件、电控或算法方向；零基础同样可以报名。',
      },
      {
        title: '新生培训',
        phase: 'TRAINING · 招新期',
        description: '参加部门 Tutorial 和实践任务，由现役队员带教，建立完成机器人项目所需的基础能力。',
      },
      {
        title: '基础考核与 RDC',
        phase: 'TRIAL · 约 11 月',
        description: '通过阶段任务检验学习成果，并在 Robot Design Contest 中组队设计、制造和调试机器人。',
      },
      {
        title: '面试与入队',
        phase: 'ONBOARDING · RDC 后',
        description: '围绕热情、责任心、协作与实践复盘交流；通过后加入部门和具体项目组。',
      },
      {
        title: '进入完整赛季',
        phase: 'SEASON · 次年春夏',
        description: '参与需求评审、研发、整机联调、开源整理与赛场保障，逐步承担稳定的项目角色。',
      },
    ]),
    faq: freezeItems([
      {
        question: '零基础可以报名吗？',
        answer: '完全可以。教程面向零基础设计，历届许多队员入队时没有机器人经验。我们更看重热情、责任心与自学能力；各部门都有从基础任务到真实项目的带教路线。',
      },
      {
        question: '有专业或年级限制吗？',
        answer: '不限专业、不限年级。工学院与 ISD 同学居多，但商学院、理学院的同学也曾入选并成为骨干。',
      },
      {
        question: '时间投入大吗？会影响学业吗？',
        answer: '比赛与交付节点前的投入会明显增加。建议在咨询或宣讲时了解当季节奏、训练安排与项目责任，再结合自己的课业规划决定；团队重视清晰沟通和长期协作。',
      },
      {
        question: 'RM2027 如何报名？',
        answer: '正式报名尚未开放。请关注公众号“HKUST ENTERPRIZE”、加入 QQ 招新群 581184202，或邮件联系 robomasterhkust@gmail.com 获取开招提醒。',
      },
      {
        question: '我已有经验，应该怎么准备？',
        answer: '报名时可以附上 GitHub、作品集、机器人项目或比赛经历。机械、嵌入式、硬件、算法与工程协作经验都会帮助你更快找到合适的项目入口。',
      },
    ]),
  });
})();
