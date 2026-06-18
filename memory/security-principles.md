---
name: security-principles
description: 客户端零信任安全原则
metadata:
  type: project
---

# Cyber-Pendant 安全原则：客户端零信任

## 核心原则

**对用户客户端零信任** — 所有安全验证必须在服务端完成，不信任任何来自客户端的输入或声明。

---

## 一、身份验证

### ❌ 错误做法

```javascript
// 客户端
const userId = localStorage.getItem('userId');
fetch('/api/garments/' + sn + '/binding', {
  body: JSON.stringify({ userId, ...data })  // ← 不要这样做！
});

// 服务端
function handleBind(req, body) {
  const userId = body.userId;  // ← 不可信！客户端可以伪造
  bindGarment(sn, data, userId);
}
```

### ✅ 正确做法

```javascript
// 客户端
const token = localStorage.getItem('token');
fetch('/api/garments/' + sn + '/binding', {
  headers: { 'Authorization': 'Bearer ' + token },  // ← 只传 token
  body: JSON.stringify(data)
});

// 服务端
function handleBind(req, context) {
  // ← 从 token 中解析，不可伪造
  const payload = requireUser(req, context.config);
  const userId = payload.sub;
  bindGarment(sn, data, userId);
}
```

---

## 二、权限检查

### 绑定操作

```javascript
async function handleBindGarment(req, res, context, sn) {
  // 1. 验证身份（从 token 解析）
  const user = requireUser(req, context.config);
  if (!user) throw new HttpError(401, '请先登录');

  // 2. 检查 SN 状态（从数据库查询，不信任客户端）
  const garment = findGarmentBySn(context.db, sn);
  if (!garment) throw new HttpError(404, '未找到该 SN');
  if (garment.status !== 'active') throw new HttpError(400, '该吊牌已停用');

  // 3. 检查是否已绑定（数据库层面）
  if (garment.bound_by_user_id) throw new HttpError(409, '该吊牌已被绑定');

  // 4. 验证输入（服务端再次验证，不信任客户端已验证）
  const binding = normalizeBindingInput(await readJson(req));

  // 5. 执行绑定（事务 + 数据库约束）
  // ...
}
```

### 解绑操作

```javascript
async function handleUnbindGarment(req, res, context, sn) {
  // 1. 验证身份
  const user = requireUser(req, context.config);

  // 2. 从数据库查询当前状态
  const garment = findGarmentBySn(context.db, sn);
  if (!garment) throw new HttpError(404, '未找到该 SN');

  // 3. 服务端检查权限（不信任客户端）
  if (garment.bound_by_user_id !== user.sub) {
    throw new HttpError(403, '只有绑定的用户才能解绑');
  }

  // 4. 执行解绑
  // ...
}
```

---

## 三、数据脱敏

### ❌ 错误做法

```javascript
// 服务端返回所有数据
const garment = findGarmentBySn(db, sn);
sendJson(req, res, 200, { garment });  // ← 泄露完整信息！

// 客户端决定显示什么
if (isLost) {
  showPhone(garment.contact_phone);  // ← 不安全！
} else {
  hidePhone(garment.contact_phone);
}
```

### ✅ 正确做法

```javascript
// 服务端根据状态返回不同数据
const garment = findGarmentBySn(db, sn);
const isLost = Boolean(garment.lost_report_id);

// DTO 转换时服务端决定脱敏策略
const dto = toGarmentDto(garment, {
  privateBinding: isAdmin,  // ← 只有管理员看完整信息
  showContact: isLost       // ← 丢失时才返回联系方式
});

sendJson(req, res, 200, { garment: dto });

// 客户端只负责展示
// 如果服务端没返回 contactInfo，客户端根本拿不到完整电话
```

---

## 四、防刷与限流

### ❌ 错误做法

```javascript
// 客户端节流
let lastClick = 0;
function onClick() {
  if (Date.now() - lastClick < 1000) return;  // ← 用户可以绕过
  lastClick = Date.now();
  fetch('/api/...');
}
```

### ✅ 正确做法

```javascript
// 服务端限流（基于 IP 或用户 ID）
function checkRateLimit(context, userId, action) {
  const key = `${action}:${userId}`;
  const count = context.redis.get(key) || 0;
  if (count > LIMIT) throw new HttpError(429, '请求过于频繁');
  context.redis.incr(key);
  context.redis.expire(key, WINDOW);
}

// 每个关键 API 都检查
async function handleBind(req, res, context, sn) {
  const user = requireUser(req, context.config);
  checkRateLimit(context, user.sub, 'bind');  // ← 服务端强制限制
  // ...
}
```

---

## 五、操作审计

### ❌ 错误做法

```javascript
// 只依赖客户端日志
console.log('User bound garment:', sn);  // ← 可被篡改
```

### ✅ 正确做法

```javascript
// 服务端记录所有敏感操作
function logBindingAction(db, action, garmentId, userId, ip, before, after) {
  db.prepare(`
    INSERT INTO binding_logs (
      garment_id, garment_sn, user_id, action, ip_address, before_data, after_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(garmentId, sn, userId, action, ip, JSON.stringify(before), JSON.stringify(after), nowIso());
}

// 在每个敏感操作后调用
async function handleBind(req, res, context, sn) {
  // ... 绑定逻辑 ...

  // 记录日志（服务端强制）
  logBindingAction(context.db, 'bind', garment.id, user.sub,
    req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    null, garment);
}
```

---

## 六、数据库约束

### 使用数据库层面防止并发问题

```sql
-- 绑定时的并发保护
UPDATE garments
SET bound_by_user_id = ?,
    student_name = ?,
    -- ...
    updated_at = ?
WHERE sn = ? AND bound_by_user_id IS NULL;  -- ← 数据库层面保证只能绑定一次

-- 检查 changed_rows
-- 如果返回 0，说明已被别人绑定
```

```javascript
const result = db.prepare(sql).run(userId, studentName, ..., sn);
if (result.changes === 0) {
  throw new HttpError(409, '该吊牌已被绑定');
}
```

---

## 七、Token 设计

### 不要在 Token 中存储敏感信息

```javascript
// ❌ 错误：存储过多信息
const token = {
  sub: userId,
  isAdmin: true,           // ← 可能在前端被篡改判断
  bindingCount: 5,         // ← 可能过期
  canReportLost: true      // ← 业务逻辑不应在 token 中
};

// ✅ 正确：只存储身份和过期时间
const token = {
  sub: userId,
  type: 'user',            // 区分 admin/user
  iat: now,
  exp: now + TTL
};

// 业务信息实时从数据库查询
const user = getUserById(db, userId);
const bindingCount = countBindings(db, userId);
```

---

## 八、前端安全实践

### 1. 敏感信息不存储在 localStorage

```javascript
// ❌ 错误
localStorage.setItem('userId', userId);
localStorage.setItem('isAdmin', true);

// ✅ 正确
// 只存储 token，且尽量使用短期 token + refresh token
localStorage.setItem('token', token);
```

### 2. 所有 API 请求带 Token

```javascript
// 统一请求拦截器
function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...options.header,
    'Authorization': token ? `Bearer ${token}` : undefined
  };
  // ...
}
```

### 3. 不在 URL 中传递敏感信息

```javascript
// ❌ 错误
fetch(`/api/garments/${sn}/binding?userId=${userId}`);

// ✅ 正确
fetch(`/api/garments/${sn}/binding`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 九、检查清单

每个敏感操作 API 必须包含：

- [ ] **身份验证**：从 Token 解析用户 ID，不接受客户端传入
- [ ] **权限检查**：从数据库查询状态，服务端判断权限
- [ ] **输入验证**：服务端重新验证所有输入
- [ ] **并发控制**：数据库事务 + 约束条件
- [ ] **操作审计**：记录 binding_logs
- [ ] **限流保护**：基于 IP 或用户 ID 的限流
- [ ] **数据脱敏**：DTO 转换时服务端决定返回内容
- [ ] **错误处理**：明确的错误码，不泄露内部信息

---

## 十、示例：完整的绑定 API

```javascript
async function handleBindGarment(req, res, context, sn) {
  // 1. 身份验证（零信任：不从客户端获取）
  const user = requireUser(req, context.config);
  if (!user) throw new HttpError(401, '请先登录');

  // 2. 限流检查（服务端强制）
  checkRateLimit(context, user.sub, 'bind');

  // 3. 查询当前状态（从数据库，不信任客户端）
  const garment = findGarmentBySn(context.db, sn);
  if (!garment) throw new HttpError(404, '未找到该 SN 对应的吊牌信息');
  if (garment.status !== 'active') throw new HttpError(400, '该吊牌已停用，不能绑定学生信息');

  // 4. 权限检查（服务端判断）
  if (garment.bound_by_user_id) {
    throw new HttpError(409, '该吊牌已被绑定');
  }

  // 5. 输入验证（服务端重新验证）
  const binding = normalizeBindingInput(await readJson(req));

  // 6. 数据库操作（事务 + 约束）
  let updated;
  context.db.exec('BEGIN IMMEDIATE');
  try {
    updated = bindGarmentOwner(context.db, sn, binding, user.sub);
    if (!updated.changed) {
      context.db.exec('ROLLBACK');
      throw new HttpError(409, '该吊牌已被绑定');
    }
    context.db.exec('COMMIT');
  } catch (error) {
    context.db.exec('ROLLBACK');
    throw error;
  }

  // 7. 操作审计（服务端强制记录）
  logBindingAction(context.db, 'bind', updated.garment.id, user.sub,
    req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    null, binding);

  // 8. 响应（数据脱敏）
  sendJson(req, res, context.config, 200, {
    garment: toGarmentDto(updated.garment)  // DTO 自动脱敏
  });
}
```

---

## 总结

**零信任原则**：服务端是唯一可信的权威来源

| 层面 | 信任度 |
|------|--------|
| 服务端代码 | ✅ 完全信任 |
| 服务端数据库查询 | ✅ 完全信任 |
| 从 Token 解析的用户 ID | ✅ 信任（签名验证） |
| 客户端请求头 | ⚠️ 部分信任（可能被伪造，需验证） |
| 客户端请求体 | ❌ 不信任（必须验证） |
| 客户端 localStorage | ❌ 不信任 |
| 客户端 JavaScript 逻辑 | ❌ 不信任 |
