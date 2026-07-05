<template>
  <div class="sidebar-logo-container" :class="{ collapse: collapse }">
    <transition name="sidebarLogoFade">
      <router-link v-if="collapse" key="collapse" class="sidebar-logo-link" to="/">
        <span class="sidebar-logo-mark">FP</span>
      </router-link>
      <router-link v-else key="expand" class="sidebar-logo-link" to="/">
        <span class="sidebar-logo-mark">FP</span>
        <h1 class="sidebar-title">{{ title }}</h1>
      </router-link>
    </transition>
  </div>
</template>

<script>
import defaultSettings from '@/settings'

export default {
  name: 'SidebarLogo',
  props: {
    collapse: {
      type: Boolean,
      required: true
    }
  },
  data() {
    return {
      title: defaultSettings.title
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/variables.scss';

.sidebarLogoFade-enter-active {
  transition: opacity 1.5s;
}

.sidebarLogoFade-enter,
.sidebarLogoFade-leave-to {
  opacity: 0;
}

.sidebar-logo-container {
  position: relative;
  width: 100%;
  height: 50px;
  line-height: 50px;
  background: $subMenuBg;
  text-align: center;
  overflow: hidden;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);

  & .sidebar-logo-link {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    & .sidebar-logo-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-right: 10px;
      border-radius: 6px;
      background: linear-gradient(135deg, #0ea5e9, #0284c7);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    & .sidebar-title {
      display: inline-block;
      margin: 0;
      color: #e2e8f0;
      font-weight: 600;
      line-height: 50px;
      font-size: 14px;
      font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      vertical-align: middle;
      white-space: nowrap;
    }
  }

  &.collapse {
    .sidebar-logo-mark {
      margin-right: 0;
    }
  }
}
</style>
