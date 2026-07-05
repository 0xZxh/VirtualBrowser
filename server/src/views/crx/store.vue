<template>
  <div class="app-container">
    <el-alert
      title="本地插件市场（MVP）：展示已上传的本地插件，可从 Chrome / Edge 商店 ID 安装占位入口。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <el-card shadow="never" class="install-card">
      <div slot="header">从商店 ID 安装（占位）</div>
      <el-form inline @submit.native.prevent="handleInstallFromStore">
        <el-form-item label="扩展 ID">
          <el-input v-model="storeId" placeholder="32 位扩展 ID" style="width: 320px" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="storeSource" style="width: 120px">
            <el-option label="Chrome" value="chrome" />
            <el-option label="Edge" value="edge" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="installing" @click="handleInstallFromStore">
            安装
          </el-button>
        </el-form-item>
      </el-form>
      <p class="tips">完整商店下载需闭源壳网络能力；当前 dev-native-bridge 仅记录元数据。</p>
    </el-card>

    <div class="section-title">本地插件目录</div>
    <el-row :gutter="16">
      <el-col v-for="item in list" :key="item.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="crx-card">
          <div class="crx-name">{{ item.name }}</div>
          <div class="crx-meta">
            <el-tag size="mini">{{ item.source || 'local' }}</el-tag>
            <span>{{ item.enabled !== false ? '已启用' : '已禁用' }}</span>
          </div>
          <div class="crx-actions">
            <el-button type="text" @click="$router.push('/crx/list')">管理</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-empty
      v-if="!listLoading && !list.length"
      description="暂无插件，请先在插件管理中上传 .crx"
    />
  </div>
</template>

<script>
import { getLocalCrxList, addLocalCrx } from '@/api/native'

const CHROME_CRX_URL =
  'https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x86-64&os_arch=x86-64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=stable&prodversion=120.0.0.0&lang=zh-CN&acceptformat=crx3&x=id%3D'
const EDGE_CRX_URL =
  'https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=&prodversion=120.0.0.0&lang=zh-CN&acceptformat=crx3&x=id%3D'

export default {
  name: 'CrxStore',
  data() {
    return {
      list: [],
      listLoading: false,
      storeId: '',
      storeSource: 'chrome',
      installing: false
    }
  },
  created() {
    this.getList()
  },
  methods: {
    async getList() {
      this.listLoading = true
      try {
        this.list = await getLocalCrxList()
      } catch (err) {
        this.$message.error(err.message || '获取插件列表失败')
      } finally {
        this.listLoading = false
      }
    },
    async handleInstallFromStore() {
      const id = (this.storeId || '').trim()
      if (!id) {
        this.$message.warning('请输入扩展 ID')
        return
      }
      this.installing = true
      try {
        const urlPrefix = this.storeSource === 'edge' ? EDGE_CRX_URL : CHROME_CRX_URL
        await addLocalCrx({
          name: id,
          source: this.storeSource,
          url: `${urlPrefix}${id}`
        })
        this.$message.success('已写入本地 catalog（商店下载待 Phase 4.5 完善）')
        this.storeId = ''
        await this.getList()
      } catch (err) {
        this.$message.error(err.message || '安装失败')
      } finally {
        this.installing = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.install-card {
  margin-bottom: 20px;
}

.tips {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.section-title {
  margin-bottom: 12px;
  font-weight: 600;
}

.crx-card {
  margin-bottom: 16px;

  .crx-name {
    font-weight: 600;
    margin-bottom: 8px;
    word-break: break-all;
  }

  .crx-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #606266;
  }

  .crx-actions {
    margin-top: 12px;
  }
}
</style>
