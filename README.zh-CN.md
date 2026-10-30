# Alma Android

[English](README.md)

这是一个面向 [Alma Desktop](https://alma.now) 的非官方 Android 客户端。你可以将它与一台或多台桌面端配对，在 Android 手机或折叠屏设备上继续处理对话。

> **免责声明：** 本项目与 Alma 项目没有隶属、合作或官方认可关系，也不由 Alma 项目维护。

## 截图

| 对话列表                                          | 对话与代码块                                          |
| ------------------------------------------------- | ----------------------------------------------------- |
| ![对话列表](docs/screenshots/threads.png)         | ![包含代码块的对话](docs/screenshots/thread-code.png) |
| 简体中文设置                                      | 文件与差异                                            |
| ![简体中文设置](docs/screenshots/settings-zh.png) | ![对话文件与差异](docs/screenshots/files-diff.png)    |

### 折叠屏

展开后切换为双栏布局：左侧导航栏和对话列表，右侧是打开的对话。开合时在外屏和内屏之间播放磨砂过渡。

| 展开，回复生成中                                                  | 展开，简体中文                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| ![双栏布局，回复生成中](docs/screenshots/foldable-generating.png) | ![简体中文双栏布局](docs/screenshots/foldable-zh.png) |

截图使用合成测试数据，不包含真实桌面内容或配对凭据。

## 安装

1. 从 [GitHub Releases](https://github.com/lazyeo/alma-android/releases) 下载 APK 和对应的 `.sha256` 文件。
2. 校验下载文件：

   ```sh
   shasum -a 256 -c alma-android-vX.Y.Z.apk.sha256
   ```

3. 按 Android 提示允许浏览器或文件管理器安装未知应用，然后打开 APK。

应用包名是 `club.a_dobe.alma`。「设置 › 更新」可在应用内检查、校验并安装新的公开版本。

## 与 Alma Desktop 配对

1. 在 Alma Desktop 中打开远程访问，显示配对链接或二维码。
2. 在 Alma Android 中扫描二维码，或粘贴配对链接。
3. 如需添加其他桌面端，重复上述步骤；之后可通过桌面切换器进行切换。

配对链接等同于该桌面端的完整访问凭据。请像保管密码一样保管它：不要分享，不要粘贴到 Issue，也不要放进日志。

应用通过 Alma 的官方中继连接。Android 设备与桌面端之间的内层隧道采用端到端加密。本应用不会把对话或配对数据存到第三方服务器；配对信息和少量界面缓存保存在设备本地，对话数据来自你的桌面端。

## 功能

- 对话、项目和 GTD 视图
- 流式回复、工具调用、审批和用户问题
- 模型、推理强度、目标与循环等编辑器选项
- 对话文件面板与差异查看，以及 HTML、Markdown 预览
- 代码块复制、Android「分享到 Alma」和图片画廊
- Desktop Base46 主题配色
- English / 简体中文：默认跟随系统，也可手动覆盖
- 折叠屏布局与磨砂转场；可选通过 Shizuku 读取实时铰链角度，无法使用时自动估算
- 回复完成或需要审批时显示本地通知

### 通知限制

本项目没有推送服务。通知由仍在运行的应用通过实时中继连接在本地生成，因此只在应用进程存活时有效。应用被杀死、强制停止、冻结或断开连接后，Android 可能不会再显示通知。

## 隐私与安全

- 使用 Alma Desktop 的远程访问链接配对，并通过端到端加密的中继隧道通信。
- 中继只转发加密流量；本应用没有用于上传对话历史的自有后端。
- 多台桌面端的配对彼此隔离。
- 配对链接是完整访问密钥。分享诊断信息或报告漏洞前，请先阅读 [SECURITY.md](SECURITY.md)。
- 客户端会主动阻止自身不需要的已知高风险桌面接口。

面向贡献者的协议说明见 [docs/protocol.md](docs/protocol.md)。

## 从源码构建

环境要求：

- Node.js 22
- JDK 21
- 已安装 API 36 的 Android SDK（`minSdk 24`，`targetSdk 36`）

```sh
npm ci
npm run check
npm run android:build
```

调试 APK 会生成在 `android/app/build/outputs/apk/debug/` 下。

发布构建使用 `npm run android:release`。只有同时设置 `ALMA_RELEASE_STORE_FILE`、`ALMA_RELEASE_STORE_PASSWORD`、`ALMA_RELEASE_KEY_ALIAS` 和 `ALMA_RELEASE_KEY_PASSWORD` 时才会签名。

生成页面的 `alma-build` 元数据格式为 `<version> <sha>`，「设置 › 关于」中会显示版本号。

## 参与贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。参与本项目即表示你同意遵守仓库的贡献与安全说明。

## 许可证

[MIT](LICENSE) © 2026 lazyeo 及贡献者。
