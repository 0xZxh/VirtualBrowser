<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
import { isDevNativeBridgeMode } from '@/api/native-bridge-client'

export default {
  name: 'App',
  mounted() {
    if (isDevNativeBridgeMode()) {
      this.$message({
        type: 'success',
        duration: 8000,
        showClose: true,
        dangerouslyUseHTMLString: true,
        message:
          '<b>二开 dev 模式</b>：native 经 Node 桥接，可在此页创建/启动环境（调用真实 Chrome-bin 内核）。'
      })
    }
  }
}
</script>
