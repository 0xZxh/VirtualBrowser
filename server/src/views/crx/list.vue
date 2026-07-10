<template>
  <div class="app-container">
    <div class="filter-container">
      <div>
        <el-upload
          v-permission="['admin', 'operator']"
          action=""
          accept=".crx,.zip"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onUploadChange"
        >
          <el-button type="primary" icon="el-icon-upload2" :loading="uploading">
            {{ $t('route.crx_upload') }}
          </el-button>
        </el-upload>
      </div>
      <div>
        <el-input
          v-model="keyword"
          placeholder="搜索插件名称"
          style="width: 220px"
          class="filter-item"
          clearable
          @keyup.enter.native="filterList"
        />
        <el-button icon="el-icon-search" @click="filterList">搜索</el-button>
        <el-button icon="el-icon-refresh" @click="getList">刷新</el-button>
      </div>
    </div>

    <el-table v-loading="listLoading" :data="filteredList" border fit style="width: 100%">
      <el-table-column label="名称" min-width="180">
        <template slot-scope="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100" align="center">
        <template slot-scope="{ row }">
          <el-tag size="mini">{{ row.source || 'local' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="大小" width="100" align="center">
        <template slot-scope="{ row }">
          <span>{{ formatSize(row.size) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="90" align="center">
        <template slot-scope="{ row }">
          <el-switch
            v-permission="['admin', 'operator']"
            :value="row.enabled !== false"
            @change="val => handleToggle(row, val)"
          />
          <span v-if="!canManageCrx">{{ row.enabled !== false ? '是' : '否' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center">
        <template slot-scope="{ row }">
          <el-button
            v-permission="['admin', 'operator']"
            type="danger"
            size="mini"
            @click="handleDelete(row)"
          >
            {{ $t('browser.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { getLocalCrxList, addLocalCrx, deleteLocalCrx, enableLocalCrx } from '@/api/native'

export default {
  name: 'CrxList',
  data() {
    return {
      list: [],
      filteredList: [],
      listLoading: false,
      uploading: false,
      keyword: ''
    }
  },
  computed: {
    canManageCrx() {
      const roles = this.$store.getters.roles || []
      return roles.some(r => ['admin', 'operator'].includes(r))
    }
  },
  created() {
    this.getList()
  },
  methods: {
    formatSize(size) {
      if (!size) return '-'
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      return `${(size / 1024 / 1024).toFixed(2)} MB`
    },
    async getList() {
      this.listLoading = true
      try {
        this.list = await getLocalCrxList()
        this.filterList()
      } catch (err) {
        this.$message.error(err.message || '获取插件列表失败')
      } finally {
        this.listLoading = false
      }
    },
    filterList() {
      const q = (this.keyword || '').trim().toLowerCase()
      if (!q) {
        this.filteredList = this.list.slice()
        return
      }
      this.filteredList = this.list.filter(item =>
        String(item.name || '')
          .toLowerCase()
          .includes(q)
      )
    },
    readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = String(reader.result || '')
          const base64 = result.includes(',') ? result.split(',')[1] : result
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    },
    async onUploadChange(file) {
      const raw = file.raw
      if (!raw) return
      this.uploading = true
      try {
        const base64 = await this.readFileAsBase64(raw)
        await addLocalCrx({
          name: raw.name.replace(/\.(crx|zip)$/i, ''),
          base64,
          source: 'local'
        })
        this.$message.success('上传成功')
        await this.getList()
      } catch (err) {
        this.$message.error(err.message || '上传失败')
      } finally {
        this.uploading = false
      }
    },
    async handleToggle(row, enabled) {
      try {
        await enableLocalCrx(row.id, enabled)
        row.enabled = enabled
        this.$message.success('状态已更新')
      } catch (err) {
        this.$message.error(err.message || '更新失败')
      }
    },
    handleDelete(row) {
      this.$confirm(`确定删除插件「${row.name}」吗？`)
        .then(async () => {
          await deleteLocalCrx(row.id)
          this.$message.success('删除成功')
          await this.getList()
        })
        .catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
.filter-container {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;

  .filter-item:not(:last-child) {
    margin-right: 10px;
  }
}
</style>
