# DeepSeek Monitor

Windows 桌面托盘工具，实时监控 DeepSeek API 账户余额和消费趋势。

![screenshot](https://img.shields.io/badge/Electron-33-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 功能

- 托盘图标显示余额，正常蓝色，低于阈值变红
- 悬浮显示余额数字
- 本月消费 + 今日消费统计
- 近 7 天每日消费柱状图
- 余额低于阈值时 Windows 通知提醒
- 一键跳转 DeepSeek 平台充值
- 导出历史数据 (CSV)
- 开机自启、自定义刷新间隔、自定义提醒阈值

## 快速开始

```bash
git clone https://github.com/你的用户名/deepseek-monitor.git
cd deepseek-monitor
npm install
npm start
```

首次启动后点击「设置」，填入 DeepSeek API Key 即可。

## 技术栈

- **前端**: HTML / CSS / JavaScript
- **后端**: Electron
- **存储**: 本地 JSON 文件（无外部依赖）

## 许可证

MIT
