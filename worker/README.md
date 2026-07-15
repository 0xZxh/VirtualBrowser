# VirtualBrowser - worker

环境启动后的默认主页（IP / 时区 / 指纹哈希 / 运行平台）。

**Mac 开发**：可在普通浏览器预览（无需内核）。见 [`docs/MAC_FRONTEND_DEV.md`](../docs/MAC_FRONTEND_DEV.md)。

## Project setup

```
npm install
```

### Compiles and hot-reloads for development

```
npm run serve
```

打开后若看到「浏览器预览模式」横幅，即可改样式/文案。可用 `?apiLink=` 指定 IP API。

### Compiles and minifies for production

```
npm run build
```

### Deploy into Chrome-bin worker（有 Windows 内核时）

```
npm run deploy:worker
```

Windows 也可：`npm run deploy:worker:ps1`

### Lints and fixes files

```
npm run lint
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
