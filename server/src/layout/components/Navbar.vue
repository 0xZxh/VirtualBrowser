<template>
  <div class="navbar">
    <hamburger
      id="hamburger-container"
      :is-active="sidebar.opened"
      class="hamburger-container"
      @toggleClick="toggleSideBar"
    />

    <breadcrumb id="breadcrumb-container" class="breadcrumb-container" />

    <div class="right-menu">
      <template v-if="device !== 'mobile'">
        <search id="header-search" class="right-menu-item" />

        <error-log class="errLog-container right-menu-item hover-effect" />

        <el-tooltip content="打开本地日志目录" effect="dark" placement="bottom">
          <div class="right-menu-item hover-effect" @click="openLogFolder">
            <i class="el-icon-folder-opened" />
          </div>
        </el-tooltip>

        <el-tooltip content="查看后端日志" effect="dark" placement="bottom">
          <div class="right-menu-item hover-effect" @click="openBackendLogs">
            <i class="el-icon-document" />
          </div>
        </el-tooltip>

        <el-tooltip content="打开管理端控制台" effect="dark" placement="bottom">
          <div class="right-menu-item hover-effect" @click="openAdminDevTools">
            <i class="el-icon-monitor" />
          </div>
        </el-tooltip>

        <screenfull id="screenfull" class="right-menu-item hover-effect" />

        <lang-select class="right-menu-item hover-effect" />
      </template>

      <el-dropdown class="user-container right-menu-item hover-effect" trigger="click">
        <span class="user-menu-trigger">
          <i class="el-icon-user-solid" />
          <span class="user-name">{{ name || $t('navbar.profile') }}</span>
          <i class="el-icon-arrow-down el-icon--right" />
        </span>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item disabled>{{ name || '—' }}</el-dropdown-item>
          <el-dropdown-item divided @click.native="logout">
            <span style="display: block">{{ $t('navbar.logOut') }}</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>

    <el-dialog
      title="后端日志"
      :visible.sync="backendLogVisible"
      width="720px"
      top="8vh"
      append-to-body
      class="backend-log-dialog"
    >
      <div class="backend-log-meta">
        <span v-if="backendLogPath">{{ backendLogPath }}</span>
        <el-button type="text" :loading="backendLogLoading" @click="loadBackendLogs">
          刷新
        </el-button>
      </div>
      <pre class="backend-log-pre">{{ backendLogContent || '（暂无日志）' }}</pre>
    </el-dialog>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import Breadcrumb from '@/components/Breadcrumb'
import Hamburger from '@/components/Hamburger'
import ErrorLog from '@/components/ErrorLog'
import Screenfull from '@/components/Screenfull'
import LangSelect from '@/components/LangSelect'
import Search from '@/components/HeaderSearch'
import { chromeSend } from '@/api/native'
import request from '@/utils/request'

export default {
  components: {
    Breadcrumb,
    Hamburger,
    ErrorLog,
    Screenfull,
    LangSelect,
    Search
  },
  data() {
    return {
      backendLogVisible: false,
      backendLogLoading: false,
      backendLogPath: '',
      backendLogContent: ''
    }
  },
  computed: {
    ...mapGetters(['sidebar', 'avatar', 'device', 'name'])
  },
  methods: {
    toggleSideBar() {
      this.$store.dispatch('app/toggleSideBar')
    },
    async openLogFolder() {
      try {
        if (window.vbDesktop && typeof window.vbDesktop.openLogFolder === 'function') {
          await window.vbDesktop.openLogFolder()
          return
        }
        const logsDir = await chromeSend('getLogsDir')
        this.$message.info('日志目录: ' + logsDir + '（请在资源管理器中打开）')
      } catch (err) {
        this.$message.error('打开日志目录失败: ' + (err && err.message ? err.message : String(err)))
      }
    },
    async openAdminDevTools() {
      try {
        if (window.vbDesktop && typeof window.vbDesktop.openDevTools === 'function') {
          await window.vbDesktop.openDevTools()
          return
        }
        this.$message.warning('仅桌面壳内可打开管理端控制台')
      } catch (err) {
        this.$message.error('打开控制台失败: ' + (err && err.message ? err.message : String(err)))
      }
    },
    async openBackendLogs() {
      this.backendLogVisible = true
      await this.loadBackendLogs()
    },
    async loadBackendLogs() {
      this.backendLogLoading = true
      try {
        const res = await request({
          url: '/api/system/logs',
          method: 'get',
          params: { lines: 300 }
        })
        const data = (res && res.data) || {}
        this.backendLogPath = data.path || ''
        this.backendLogContent = data.content || ''
        if (data.exists === false) {
          this.backendLogContent = '（日志文件尚不存在，请确认远端已部署并重启 server-backend）'
        }
      } catch (err) {
        // request interceptor already toasts; keep dialog usable
        this.backendLogContent = '加载失败: ' + (err && err.message ? err.message : String(err))
      } finally {
        this.backendLogLoading = false
      }
    },
    async logout() {
      await this.$store.dispatch('user/logout')
      this.$router.push('/login')
    }
  }
}
</script>

<style lang="scss" scoped>
.navbar {
  height: 52px;
  overflow: hidden;
  position: relative;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: none;

  .hamburger-container {
    line-height: 52px;
    height: 100%;
    float: left;
    cursor: pointer;
    transition: background 0.2s;
    -webkit-tap-highlight-color: transparent;
    padding: 0 4px;

    &:hover {
      background: #f1f5f9;
    }
  }

  .breadcrumb-container {
    float: left;
    line-height: 52px;
  }

  .errLog-container {
    display: inline-block;
    vertical-align: top;
  }

  .right-menu {
    float: right;
    height: 100%;
    line-height: 52px;
    display: flex;
    align-items: center;

    &:focus {
      outline: none;
    }

    .right-menu-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 10px;
      height: 36px;
      margin: 0 2px;
      font-size: 18px;
      color: #64748b;
      border-radius: 6px;
      vertical-align: middle;

      &.hover-effect {
        cursor: pointer;
        transition: background 0.2s, color 0.2s;

        &:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
      }
    }

    .user-container {
      margin-right: 12px;
      margin-left: 4px;

      .user-menu-trigger {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        font-size: 14px;
        color: #64748b;
        height: 36px;
        padding: 0 8px;
        border-radius: 6px;
        transition: background 0.2s, color 0.2s;

        &:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .el-icon-user-solid {
          font-size: 16px;
          margin-right: 6px;
        }

        .user-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }

    .avatar-container {
      margin-right: 30px;

      .avatar-wrapper {
        margin-top: 5px;
        position: relative;

        .user-avatar {
          cursor: pointer;
          width: 40px;
          height: 40px;
          border-radius: 10px;
        }

        .el-icon-caret-bottom {
          cursor: pointer;
          position: absolute;
          right: -20px;
          top: 25px;
          font-size: 12px;
        }
      }
    }
  }
}

.backend-log-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: #64748b;
  word-break: break-all;
}

.backend-log-pre {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
