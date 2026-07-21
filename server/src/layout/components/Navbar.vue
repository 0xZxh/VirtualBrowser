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

        <screenfull id="screenfull" class="right-menu-item hover-effect" />

        <!-- <el-tooltip :content="$t('navbar.size')" effect="dark" placement="bottom">
          <size-select id="size-select" class="right-menu-item hover-effect" />
        </el-tooltip> -->

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

export default {
  components: {
    Breadcrumb,
    Hamburger,
    ErrorLog,
    Screenfull,
    LangSelect,
    Search
  },
  computed: {
    ...mapGetters(['sidebar', 'avatar', 'device', 'name'])
  },
  methods: {
    toggleSideBar() {
      this.$store.dispatch('app/toggleSideBar')
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
</style>
