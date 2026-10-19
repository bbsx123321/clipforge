# ClipForge 微软商店提审 Checklist

> 按顺序勾项；标 ★ 的是当前代码/资料尚未完成、需要你（开发者账号持有人）补齐的事项。

## 一、开发者账号

- [ ] 注册微软合作伙伴中心个人开发者账号（中国区个人自 2025 年 9 月起免费注册）
- [ ] 完成身份验证（个人：身份证/护照 + 地址电话）
- [ ] 税务资料（个人免费应用通常可跳过支付账户，按表单提示填写）

## 二、打包（MSIX）

- [ ] 用 electron-builder 产出 NSIS exe（`bash scripts/pack.sh`，已有配置）
- [ ] ★ 安装 MSIX Packaging Tool（微软商店免费）或用 electron-builder 的 msix 目标，把 exe 转打包为 MSIX
      ——注册账号后，在「产品标识」页拿到 **Package/Identity Name** 与 **Publisher**，
      填入 `package.json` → `build.win.msix.identityName / publisher` 再打包
- [ ] MSIX 签名：商店提交流程会重签名，本地打包无需购买证书

## 三、合规声明

- [ ] ★ 应用内「关于」入口补充 FFmpeg GPL v3 声明（当前仅在隐私政策中提及；建议设置面板加一行 + 对应源码获取方式说明）
- [ ] 确认 ffmpeg 二进制为 GPL 兼容发行版（BtbN/gyan 均为 GPL 版 ✓）

## 四、商店 listing（资料齐备，复制即可）

- [ ] 中文页：`listing-zh.md` 的名称/描述/关键词
- [ ] 英文页：`listing-en.md` 的名称/描述/关键词
- [ ] 截图上传：`store/listing/shots/` 下 hero / editor / region-frame（中英页面用对应语言版本，至少 1 张，至多 10 张，全部 ≥1366×768 ✓）
- [ ] ★ 隐私政策：把 `privacy.md` 部署为公开 URL（GitHub Pages 步骤：建公开仓库 → 放 README/privacy.md → Settings → Pages 开启）
- [ ] 年龄分级问卷：内容全选「无」→ 全年龄
- [ ] 市场定价：全部市场免费

## 五、提审前自测（应用质量红线，微软会机审+人审）

- [ ] 安装包在**干净系统**（无 Node/无开发环境）安装后可正常启动
- [ ] 首次启动无崩溃、无报错弹窗（`logs/main.log` 无 error）
- [ ] 录制 → 停止 → 播放 → 剪辑 → 导出全流程
- [ ] 托盘图标右键菜单、快捷键（F10/F11）
- [ ] 中英文切换即时生效
- [ ] `bash scripts/smoke.sh` 通过（≥8 秒视频产物）
- [ ] `npx electron . --smoke-i18n` 退出码 0
- [ ] 卸载干净（MSIX 卸载不留残留服务/计划任务）

## 六、提交

- [ ] 合作伙伴中心 → 提交 → 附 MSIX → 自动签名校验 → 等待审核（新应用通常 1–3 个工作日）
- [ ] 审核反馈若被拒：最常见原因是「隐私政策 URL 不可访问」或「描述提到商店外下载」——按邮件修改后重提

## 当前资料总览

```
store/
├── assets/
│   ├── icons/            # 应用图标 16–256px + build/icon.ico（已接入打包）
│   ├── make-icons.ps1    # 图标生成脚本（可复现）
│   ├── make-hero.ps1     # hero 合成脚本（可复现）
│   ├── tray-idle.png     # 托盘图标（已接入 resources/icons/）
│   └── tray-recording.png
└── listing/
    ├── listing-zh.md     # 中文页文案
    ├── listing-en.md     # 英文页文案
    ├── privacy.md        # 隐私政策（待部署为 URL）
    ├── submit-checklist.md
    └── shots/            # hero-zh/en + editor-zh/en + region-frame
```
