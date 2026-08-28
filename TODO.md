仓库要求: 每修好一个记得在TODO里打勾, 严禁自己截图检查, 减少时间浪费, 如果你打勾的东西我看到没有修好, 我会实时反馈给你,你不要自己检查

问题汇总:

界面方面:
- [x] enter the ARENA按钮平行四边形框和字左右太贴了, 平行四边形按钮和上面的文字距离太窄,再下移1.5倍, 按钮颜色转变改成加载进度条, 防止未加载完时被用户当做卡顿, 这个按钮大小再夸张一点, 引导页中文颜色改成浅灰
- [x] 引导页到EXPLORE的穿梭效果衔接太突兀, 当前最后一帧穿梭线条是从屏幕中央发起的, 切换到explore阶段背景变成深色, 太突兀->改为只有第一批穿梭线条扩散出屏幕,最后帧屏幕中间是空的-> 切换到explore阶段背景变成深色, 把点云和3d交互的背景深色   统一成引导页/开源页的背景深色

- [x] 所有EST 2015都改成SINCE 2015

- [x] CLICK点按波纹·DRAG环绕观察·SCROLL开始扫描 改成点按波纹 拖拽环视 滑动进入, 同时左下角三个按钮上面写:下滑进入战场, 手机端这几个字改成换行

- [x] 3d交互右下角timeline_0框, DART 和 HIT和进度条重合, 应往下移

- [x] 把网页图标加上设成assets\icon\blue_logo.png

- [x] 手机端who we are 界面, ENTERPRIZE字样右侧超过屏幕范围, 应保持任何时候字体同行宽度小于屏幕,ENTERPRIZE字样不允许换行. 2015, top12 ,35+, #1改成深色卡片. 手机端改成不显示右侧悬浮logo

- [x] 留下你的坐标板块, 文字\图标和卡片边框间距太紧, 应把卡片边框往外扩

交互方面:
- [x] 不要每次切换窗口聚焦(比如我从其他app切换回浏览器)都重新进入一遍引导页, 太烦了, opensource页面就没这个问题

- [x] 引导页增加空格/下滑进入EXPLORE(和按钮同功能)

- [x] 引导页右上角添加两个按钮:2D介绍, 开源档案, 这个在最开始就渐显, 防止有人觉得动画太慢

- [x] EXPLORE右下背景logo,增加上下悬浮动画

- [x] 手机端3d交互环视模式下增加双指缩放支持

- [x] 结尾ENTER THE ARENA按钮, 点击后跳转到环视视角, 跳转过渡是渐显

- [x] 开源文档页面右上角点击"加入我们", 会重新显示引导页,然后点击按钮后

- [ ]

性能方面:
- [x] 引导页有部分用户(>2)反馈按钮卡在蓝色无法点击, 刷新后正常出现红色按钮, 其他用户没有问题, 排查
- [x] 引导页穿梭时会略微卡顿
- [x] EXPLORE阶段左下角按钮提示出现时会卡顿
- [x] b站视频提早加载, 滑动到窗口可见再播放
- [x] 照片墙有的时候图片不显示(手机端复现过三次), 考虑把1.webp之外的进一步压缩, 然后考察有没有其他隐藏问题导致这个问题

新增修复:
- [x] EXPLORE右下背景logo悬浮动画开始时会跳变一下,修复, 然后EXPLORE都加载出来之后还会突然卡一下
- [x] 下滑进入战场和下面几个按钮右边的小字格式同步, 英文+中文
- [x] "点按波纹,拖拽环视,滑动进入"格式和3d交互的格式颜色都同步一下, 使用英文灰字+中文白字
- [x] 关于文件夹折线, opensource的是很好的:有红蓝描边, 比例合适, 手机端适配良好, 然后index就有问题, 你同步一下,包括"who we are"等所有大标题都要这个折线,左右交替的
- [x] EXPLORE和3d交互的背景深色, 统一成引导页/开源页的背景(星星不变), 这个你刚刚没有完成
- [x] enter the arena按钮目前离上面的文字又有点太远了, 抬高一点
- [x] enter the arena出现时, 上面的文字直接瞬移到画面上部, 这太突兀了, 改成文字上移后, 再出现按钮, 引导页严禁闪现, 中文文字"队名取自...."也应使用渐显显示

- [x] 3d全局交互时,点击运动的车辆, 摄像机会focus到点击时的位置, 但是由于车在移动, 镜头下一秒会直接跳转到车的位置再跟随移动, 修复使其丝滑

- [x] 把2d页面的自动吸附和滑动阻尼全清理干净删了, 现在有怪bug, 直接删

- [x] 当前who we are界面, 由于改了折线但是没做遮罩, 现在折线外部也有照片,修复.
- [x] 上述问题未完全修复, 现在折线外部是空的了, 但是没有露出下面的照片墙
- [x] 上述问题未完全修复, 现在照片墙露出来了, 但是照片墙上方还有一层阴影, 遮罩没有考虑, 导致现在遮罩部分和上面的照片墙颜色不一致

- [x] 去掉who we are界面下方的折线, 去掉back to ARENA上方的折线

- [x] 告诉我怎么改造自动吸附和滑动阻尼, 使2d页面的手感丝滑
  方案备忘(当前保持原生滚动, 未回滚吸附/阻尼代码):
  1. 不要全页 `scroll-snap-type` + 大量 `data-snap-scene`: 会和 wheel/touch 惯性、章节按钮 `scrollIntoView`、3D handoff 抢控制权, 容易出现"滑一下被拽回去"。
  2. 若只想要关键落点, 用 **少量** proximity snap(≤5 个稳定画面), `scroll-snap-stop: normal`, 并在程序滚动期间临时 `scroll-snap-type: none`。
  3. 阻尼优先交给浏览器原生惯性; 需要跟手视差时用 `useScroll` 直接映射, 不要再叠 `useSpring` 拖尾(手机端会拖影/卡帧)。
  4. 章节跳转用一次 `scrollIntoView({ behavior: "auto", block: "start" })`, 或自写短 rAF ease; 不要同时开 CSS smooth + JS smooth。
  5. 3D→2D 交接与 2D 自由滚动解耦: 交接用一次 `scrollTo` + CSS transform 上移, 结束后立刻还权给原生滚动。
- [x] 现在3D到2D的切换速度太快,有闪现感, 修复成2D丝滑上移, 并加入3D结束自动滚动到2D
- [x] 3D→2D 不是速度问题而是先整页闪现再上滑: 先挂 entering(opacity0) 再露 document-mode
- [x] 2D 有限自动吸附: archive-wrap 顶部贴顶, archive-banner 上下居中, "你的选择是什么" 上沿贴顶, archive-return__inner 上下居中
- [x] 吸附手感改成下滑自然翻到下一页: mandatory + always, 程序跳转短暂关 snap
- [x] beyond / who-we-are 吸力过强: 这两点改为 scroll-snap-stop:normal, 其余 always 不变
- [x] BACK TO THE ARENA: archive-wrap 整块上下居中吸附 (return-arena center + 100svh)
- [x] return-arena 吸不上: snap 改挂整段 100svh section + 去 overflow:hidden + 文末留 center 余量
- [x] SCRUB→EXPLORE 脚底引导圈残留: exploreReloading 期间禁止 robotGuides 再 show
- [x] SCRUB→EXPLORE 3D 脚底环残留: rings 进 deferred layer + setHighlightTarget(0) 立刻掐灭
- [x] 3D 全局交互脚底圈提前出现: scanK≥0.45 即点亮 + 淡入加快
- [x] 手机端 EXPLORE 不显示背景品牌 logo (display:none + mask 仅桌面加载)
- [x] 手机端「下滑进入战场」改到底部正中央
- [x] 前往招新按钮加大、离右缘远一点 (CSS 变量可调)
- [x] 前往招新: right 回退 64/36; gap 加倍 14→28 / 手机 10→20
- [x] EXPLORE 去掉正下方 hint-bar; 右上角 state-chip 左侧加「前往招新」(开源 join 风格) 跳转留下你的坐标
- [x] 「前往招新」在全局交互(scrub/focus/scan/end)也显示, 不只 EXPLORE
- [x] BEYOND THE ARENA 右侧无用按钮删除

- [x] 新增以下信息到留下你的坐标方便新生检索（报名问卷 / 招新视频 / Lab 指路 / 公众号 / B站）
- [x] 留下你的坐标下面新增文件下载按钮（面试题及学习资料 / C++ Tutorial / 在线报名问卷）
- [x] who we are 界面也需要吸附（顶部贴顶）
- [x] who we are snap offset 方向修正为负值(折线顶出视口); 「你的选择是什么」吸附删除
- [x] BEYOND THE ARENA 也要加吸附
- [x] EXPLORE 上滑时右侧选项卡跟着上移: panel 改 fixed + scroll-lock touch/overscroll 锁死
- [x] 全站禁用网页缩放(viewport + pinch/ctrl-wheel), 避免和 3D 冲突

