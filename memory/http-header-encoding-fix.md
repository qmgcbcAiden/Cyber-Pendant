---
name: http-header-encoding-fix
description: HTTP 头部中文文件名编码修复
metadata:
  type: reference
  created: 2026-06-24
---

# HTTP 头部中文文件名编码

## 问题描述

当 `Content-Disposition` 响应头包含中文字符（如 "吊牌码"）时，Node.js HTTP 服务器会抛出 `ERR_INVALID_CHAR` 错误：

```
TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Content-Disposition"]
```

HTTP 头部只允许 ASCII 字符。

## 解决方案

使用 RFC 5987 编码格式：

```javascript
'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
```

## 已修复位置

- `server/src/api.js` 第 1771 行：Excel 导出（`handleExcelExportWithQrCodes`）
- `server/src/api.js` 第 1516 行：ZIP 批量导出（`handleExportBatchQrCodesZip`）

## 参考

- RFC 5987: Character Set and Language Encoding for HTTP Header Field Parameters
- 编码格式：`filename*=UTF-8''<percent-encoded-filename>`
