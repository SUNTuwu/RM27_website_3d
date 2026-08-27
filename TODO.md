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

- [x] 自动吸附修复, 我将指定好几个元素,其他的吸附全部删除:
    <header class="relative flex min-h-[44svh] items-end bg-[linear-gradient(180deg,transparent_0%,rgb(5_8_15/0.55)_42%,rgb(5_8_15/0.35)_72%,transparent_100%)] px-5 pb-8 pt-20 sm:px-8 md:px-12 md:pb-12 xl:px-16"><div class="mx-auto grid w-full max-w-[1500px] items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]"><div class="max-w-5xl"><p class="mb-5 font-mono text-xs font-semibold uppercase text-muted-foreground md:text-sm">FIELD LOG // 06 FRAMES</p><h2 class="font-[Audiowide] text-5xl leading-[0.98] text-foreground md:text-7xl xl:text-8xl">BEYOND THE ARENA</h2><p class="mt-5 text-xl font-bold text-foreground md:text-2xl">赛场之外，仍是赛场</p><p class="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">出发、调试、呐喊、拥抱。一支战队真正被记住的，不只有比分。</p></div><div class="flex items-center gap-3"><button aria-label="进入赛事影像" class="grid size-11 place-items-center rounded-sm border border-border bg-card text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="进入赛事影像" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg></button><button class="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>读取战队档案</button></div></div></header>顶部贴顶

    <img src="/assets/images/archive/arena-fleet-web.webp" alt="ENTERPRIZE 战队机器人列阵">图片上下居中

    <header class="archive-head reveal is-in">
            <div class="archive-head__meta">
              <span class="archive-head__chip">MEDIA</span>
              <span class="archive-head__rule" aria-hidden="true"></span>
              <span class="archive-head__tag">// FOOTAGE</span>
            </div>
            <h2 class="archive-head__title">ON THE RECORD</h2>
            <p class="archive-head__cn">影像记录 — 招新影像与高光回放</p>
          </header>顶部贴顶

    <div class="archive-wrap">
          <header class="archive-head reveal is-in">
            <div class="archive-head__meta">
              <span class="archive-head__chip">CH.01</span>
              <span class="archive-head__rule" aria-hidden="true"></span>
              <span class="archive-head__tag">// TEAM</span>
            </div>
            <h2 class="archive-head__title">WHERE DO WE COME FROM</h2>
            <p class="archive-head__cn">队伍信息 — 十年磨一剑，一舰越重洋</p>
          </header>

          <div class="archive-circuit">
            <div class="archive-circuit__row archive-circuit__row--left reveal is-in">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/mechanics-blueprint.webp')">
                <span class="archive-flag__index">2015 // SET SAIL</span>
                <h3>舰队启航</h3>
                <span class="archive-flag__en">SINCE 2015</span>
                <p>HKUST RoboMaster Team 成立，全球最早踏上 RoboMaster 赛场的队伍之一，代表香港科技大学征战至今。</p>
              </article>
            </div>
            <div class="archive-circuit__row archive-circuit__row--right reveal is-in" style="--rd: 80ms">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/embedded-control-blueprint.webp')">
                <span class="archive-flag__index">2018 // FIRST CROWN</span>
                <h3>国际赛区冠军</h3>
                <span class="archive-flag__en">SUPERCAPACITOR OPEN-SOURCED</span>
                <p>国际赛区冠军 · 超级电容方案首次开源，改变全圈供电设计。</p>
              </article>
            </div>
            <div class="archive-circuit__row archive-circuit__row--left reveal" style="--rd: 160ms">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/hardware-blueprint.webp')">
                <span class="archive-flag__index">2019 // GLOBAL TOP 12</span>
                <h3>全球十二强</h3>
                <span class="archive-flag__en">BEST IN TEAM HISTORY</span>
                <p>国际赛区冠军 · 全球总决赛 <b>12 强</b>（173 支队伍，队史最佳）。</p>
              </article>
            </div>
            <div class="archive-circuit__row archive-circuit__row--right reveal" style="--rd: 240ms">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/algorithm-blueprint.webp')">
                <span class="archive-flag__index">2021 // OVERSEAS NO.1</span>
                <h3>中期评估第一</h3>
                <span class="archive-flag__en">RMUC MIDTERM 203 PTS</span>
                <p>RMUC 中期评估 203 分 · <b>港澳台及海外队伍第 1 名</b>。</p>
              </article>
            </div>
            <div class="archive-circuit__row archive-circuit__row--left reveal" style="--rd: 320ms">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/mechanics-blueprint.webp')">
                <span class="archive-flag__index">2024 // GUANGDONG 3V3</span>
                <h3>3V3 一等奖</h3>
                <span class="archive-flag__en">OPEN-SOURCE AWARD</span>
                <p>联盟赛广东站 3V3 一等奖 · 超级电容控制器获赛季开源奖三等奖。</p>
              </article>
            </div>
            <div class="archive-circuit__row archive-circuit__row--right reveal" style="--rd: 400ms">
              <article class="archive-flag" style="--flag-img: url('/assets/images/dept/embedded-control-blueprint.webp')">
                <span class="archive-flag__index">2025—2026 // PEAK FORM</span>
                <h3>巅峰赛季</h3>
                <span class="archive-flag__en">CHAMPIONS &amp; NATIONAL AWARDS</span>
                <p>浙江站 3V3 <b>冠军</b> · 超级对抗赛全国 <b>二等奖</b> · 雷达局均易伤 1618.3s <b>全国第一</b> · 2026 安徽站 <b>甲级二等奖（十六强）</b>，持续进化中。</p>
              </article>
            </div>
          </div>
        </div>顶部贴顶


        <div class="archive-wrap">

          <header class="archive-head reveal is-in">
            <div class="archive-head__meta">
              <span class="archive-head__chip">CH.02</span>
              <span class="archive-head__rule" aria-hidden="true"></span>
              <span class="archive-head__tag">// UNITS</span>
            </div>
            <h2 class="archive-head__title">ROBOT ARCHIVE</h2>
            <p class="archive-head__cn">兵种体系 — 钢铁图鉴</p>
          </header>

          <!-- What is RoboMaster: 重装同款横向媒体框; 视频链接与嵌入方式和参考站完全一致 -->
          <div class="archive-sub reveal is-in">
            <span class="archive-sub__chip">THE GAME // 赛事速览</span>
            <h3 class="archive-sub__title">什么是 RoboMaster 机甲大师赛</h3>
          </div>
          <div class="archive-media-row archive-media-row--intro reveal is-in" style="margin-top: 26px">
            <div class="archive-media-row__visual archive-media-row__visual--video">
              <iframe data-src="https://player.bilibili.com/player.html?isOutside=true&amp;aid=837903821&amp;bvid=BV14g4y1z7QC&amp;cid=184409391&amp;p=1" data-video-autoload="" allow="autoplay; fullscreen; picture-in-picture" scrolling="no" frameborder="0" allowfullscreen="true" loading="eager" referrerpolicy="strict-origin-when-cross-origin" title="什么是 RoboMaster" src="https://player.bilibili.com/player.html?isOutside=true&amp;aid=837903821&amp;bvid=BV14g4y1z7QC&amp;cid=184409391&amp;p=1&amp;autoplay=1&amp;muted=1" data-video-hydrated="playing" data-video-playing="true"></iframe>
              <button class="video-facade video-facade--intro" type="button" data-video-facade="" aria-label="播放 RoboMaster 赛事介绍" hidden="">
                <span class="video-facade__inner">
                  <span class="video-facade__play" aria-hidden="true"></span>
                  <span class="video-facade__text">WATCH INTRO</span>
                  <span class="video-facade__hint">BILIBILI PLAYER</span>
                </span>
              </button>
            </div>
            <div class="archive-media-row__body">
              <span class="archive-media-row__index">WHAT IS ROBOMASTER // 赛事介绍</span>
              <h3 class="archive-media-row__title">什么是 RoboMaster</h3>
              <span class="archive-media-row__en">机甲大师赛 · 全球大学生机器人对抗赛</span>
              <p class="archive-media-row__desc">
                RoboMaster 机甲大师赛是面向大学生的机器人对抗赛事。参赛队伍需要跨机械、硬件、电控与算法协作，自主完成多类机器人的设计、制造、调试与赛场部署。
              </p>
              <p class="archive-media-row__desc">
                ENTERPRIZE 自 2015 年起代表香港科技大学参赛。具体兵种、赛制与胜利条件会随赛季调整，请以当季官方规则为准。
              </p>
              <p class="archive-media-row__note">视频通过 Bilibili 官方播放器嵌入，内容与版权说明以原视频页面为准。</p>
            </div>
          </div>

          <!-- 兵种图文揭示: GIF 嵌入大字, 滚动展开, 表达缺一不可 -->
          <div class="unit-reveal" id="unit-reveal" data-unit-reveal="" data-snap-scene="unit-reveal" data-snap-align="center" aria-label="各兵种缺一不可">
            <p class="unit-reveal__eyebrow reveal is-in">FULL LINEUP // 全员就位</p>
            <div class="unit-reveal__lines">
              <div class="unit-reveal__line">
                <span class="unit-reveal__text">英雄</span>
                <span class="unit-reveal__media" data-follow-src="/assets/images/hero/英雄1.webp" style="--p: 0.000;">
                  <img src="/assets/images/hero/英雄1.webp" alt="英雄机器人发射 42mm 弹丸" loading="lazy" decoding="async">
                </span>
                <span class="unit-reveal__text">重炮破阵</span>
              </div>
              <div class="unit-reveal__line">
                <span class="unit-reveal__text">经济命脉</span>
                <span class="unit-reveal__media" data-follow-src="/assets/images/engineer/工程1.webp" style="--p: 0.000;">
                  <img src="/assets/images/engineer/工程1.webp" alt="工程机器人作业演示" loading="lazy" decoding="async">
                </span>
                <span class="unit-reveal__text">工程</span>
              </div>
              <div class="unit-reveal__line">
                <span class="unit-reveal__text">步兵</span>
                <span class="unit-reveal__media" data-follow-src="/assets/images/infantry/步兵.webp" style="--p: 0.000;">
                  <img src="/assets/images/infantry/步兵.webp" alt="步兵机器人弹雨巡弋" loading="lazy" decoding="async">
                </span>
                <span class="unit-reveal__text">弹雨巡弋</span>
              </div>
              <div class="unit-reveal__line unit-reveal__line--plain">
                <span class="unit-reveal__text">你的选择是什么？</span>
              </div>
              <div class="unit-reveal__line unit-reveal__line--plain">
                <span class="unit-reveal__text unit-reveal__text--en">CHOOSE YOUR HERO</span>
              </div>
            </div>
            <div class="unit-reveal__follower" id="unit-reveal-follower" aria-hidden="true">
              <img src="/assets/images/hero/英雄1.webp" alt="" decoding="async">
            </div>
          </div>

          <!-- 兵种堆叠图集: 横屏左右贴边, 斜线分割, 悬停聚焦展开 -->
          <div class="unit-stack reveal is-in" role="list" aria-label="兵种图鉴, 悬停展开详情">
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/hero.webp" alt="英雄机器人" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-01</span>
                <h3 class="unit-slot__name">英雄</h3>
                <span class="unit-slot__en">HERO // 攻城之王</span>
                <p class="unit-slot__desc">地面主力输出，发射 42mm 大弹丸，可对前哨站与基地造成高额伤害，是推进战线的核心火力单位。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/engineer.webp" alt="工程机器人" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-02</span>
                <h3 class="unit-slot__name">工程</h3>
                <span class="unit-slot__en">ENGINEER // 经济命脉</span>
                <p class="unit-slot__desc">唯一可获取经济的单位：开采、存储、兑换能量单元，甚至瞬间复活阵亡队友。每一环都是胜负手。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/infantry.webp" alt="步兵机器人" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-03</span>
                <h3 class="unit-slot__name">步兵</h3>
                <span class="unit-slot__en">INFANTRY // 巡弋骑士</span>
                <p class="unit-slot__desc">机动与火力均衡的地面中坚：游走、牵制、收割——战线的每一寸推进，都由步兵的弹雨写就。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/sentry.webp" alt="哨兵机器人" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-04</span>
                <h3 class="unit-slot__name">哨兵</h3>
                <span class="unit-slot__en">SENTRY // 钢铁哨卫</span>
                <p class="unit-slot__desc">部署于基地前沿的全自动防御单位：自主索敌、自主开火，用算法守住基地的最后一道防线。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/drone.webp" alt="空中机器人" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-05</span>
                <h3 class="unit-slot__name">空中</h3>
                <span class="unit-slot__en">DRONE // 制空之眼</span>
                <p class="unit-slot__desc">赛场唯一的空中单位：越过地形实施高空打击与视野支援，是打破地面僵局的立体变量。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/dart.webp" alt="飞镖系统" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-06</span>
                <h3 class="unit-slot__name">飞镖</h3>
                <span class="unit-slot__en">DART // 超视距狙击</span>
                <p class="unit-slot__desc">从己方半场发射的精确制导弹体，跨越整个赛场直击前哨站与基地，一击改写战局。</p>
              </div>
            </article>
            <article class="unit-slot" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/web/radar.webp" alt="雷达站" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-07</span>
                <h3 class="unit-slot__name">雷达</h3>
                <span class="unit-slot__en">RADAR // 全局之眼</span>
                <p class="unit-slot__desc">固定式感知中枢：解算全场目标位置并与全队共享，让所有机器人看见同一张战场。</p>
              </div>
            </article>
            <article class="unit-slot unit-slot--unknown" role="listitem" tabindex="0">
              <span class="unit-slot__media"><img src="/assets/images/robot_list/问号.webp" alt="未知兵种" loading="lazy" decoding="async"></span>
              <span class="unit-slot__scrim" aria-hidden="true"></span>
              <div class="unit-slot__info">
                <span class="unit-slot__index">UNIT-??</span>
                <h3 class="unit-slot__name">???</h3>
                <span class="unit-slot__en">NEXT UNIT // 情报解密中</span>
                <p class="unit-slot__desc">RM2027 赛季新兵种档案尚未解密——下一台机器，也许由你亲手造出来。</p>
              </div>
            </article>
          </div>

        </div>顶部贴顶


    "十年磨一剑....."上下居中


    <span class="unit-reveal__text">你的选择是什么？</span>顶部贴顶

    join the fleet 同理, 顶部贴边


    <div class="archive-wrap archive-return__inner">
          <p class="archive-eyebrow reveal is-in">FINAL TRANSMISSION // 最后通话</p>
          <h2 class="archive-return__title reveal is-in" style="--rd: 90ms">BACK TO<br>THE ARENA</h2>
          <p class="archive-return__cn reveal is-in" style="--rd: 180ms">
            文字的尽头，是钢铁的轰鸣。<br>
            赛场仍在运转，机器人仍在待命——回去，<b>点击任意一台机器人</b>，读取它的完整战场档案。
          </p>
          <button class="archive-return__btn reveal is-in" style="--rd: 260ms" type="button" data-action="return-arena">
            <span class="archive-return__btn-cn">重返 3D 赛场</span>
            <span class="archive-return__btn-en">ENTER THE ARENA</span>
          </button>
          <p class="archive-return__hint reveal is-in" style="--rd: 340ms">SCROLL UP TO RETURN · 向上滚动同样返回</p>
          <a class="archive-return__os reveal is-in" style="--rd: 420ms" href="/open-source.html">
            <span class="archive-return__os-cn">开源档案库</span>
            <span class="archive-return__os-en">OPEN SOURCE ARCHIVE ⟶</span>
          </a>
        </div>上下居中
