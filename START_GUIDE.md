# 启动指南

## 快速启动

### 1. 安装依赖（首次运行）

在项目根目录打开终端，运行：

```bash
npm install
```

这将安装所有必需的依赖包（Vite、Three.js、GSAP等）。

### 2. 启动开发服务器

运行以下命令启动开发服务器：

```bash
npm run dev
```

或者：

```bash
npm start
```

### 3. 访问应用

启动成功后，终端会显示类似以下信息：

```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

在浏览器中打开显示的本地地址（通常是 `http://localhost:5173/`）即可查看模拟器。

## 其他命令

### 构建生产版本

```bash
npm run build
```

构建完成后，文件会输出到 `dist/` 目录。

### 预览生产版本

```bash
npm run preview
```

## 常见问题

### 1. 端口被占用

如果 5173 端口被占用，Vite 会自动尝试下一个可用端口。或者可以手动指定端口：

```bash
npm run dev -- --port 3000
```

### 2. 依赖安装失败

如果 `npm install` 失败，尝试：

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 3. 模型文件加载失败

确保以下文件存在于 `public/` 目录：
- `small_caddie.glb` - 机器人模型
- `red_car.glb` - 车辆模型
- `Parking_fixed.glb` - 停车场模型
- `mid_caddie.glb` - 充电站模型（可选）

### 4. 模块导入错误

如果遇到模块导入错误，确保：
- 所有新创建的文件（`pathfinding.js`, `orderSystem.js`）都在 `src/` 目录下
- 主文件 `main_sim.js` 中正确导入了这些模块

## 开发提示

- 修改代码后，浏览器会自动热重载
- 查看浏览器控制台（F12）查看日志和错误信息
- 使用鼠标拖拽旋转视角，滚轮缩放

## 系统要求

- Node.js 16+ 
- 现代浏览器（Chrome、Firefox、Edge、Safari）
- 支持 WebGL 的显卡
