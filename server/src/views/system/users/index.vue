<template>
  <div class="app-container">
    <div class="filter-container">
      <el-button type="primary" icon="el-icon-plus" @click="handleCreate">
        {{ $t('systemUser.add') }}
      </el-button>
    </div>

    <el-table v-loading="listLoading" :data="list" border fit highlight-current-row>
      <el-table-column :label="$t('systemUser.username')" prop="username" min-width="120" />
      <el-table-column :label="$t('systemUser.name')" prop="name" min-width="120" />
      <el-table-column :label="$t('systemUser.roles')" min-width="160">
        <template slot-scope="{ row }">
          <el-tag v-for="role in row.roles" :key="role" size="mini" style="margin-right: 4px">
            {{ role }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('systemUser.tenantId')" prop="tenantId" width="100" />
      <el-table-column :label="$t('systemUser.status')" width="100" align="center">
        <template slot-scope="{ row }">
          <el-tag :type="row.disabled ? 'info' : 'success'" size="mini">
            {{ row.disabled ? $t('systemUser.disabled') : $t('systemUser.active') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="$t('browser.actions')" width="360" align="center">
        <template slot-scope="{ row }">
          <el-button size="mini" type="success" @click="handleAssignBrowsers(row)">
            {{ $t('systemUser.assignBrowsers') }}
          </el-button>
          <el-button size="mini" type="primary" @click="handleUpdate(row)">
            {{ $t('browser.edit') }}
          </el-button>
          <el-button size="mini" @click="handleResetPassword(row)">
            {{ $t('systemUser.resetPassword') }}
          </el-button>
          <el-button
            v-if="!row.disabled && row.username !== 'admin'"
            size="mini"
            type="danger"
            @click="handleDisable(row)"
          >
            {{ $t('systemUser.disable') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog :title="dialogTitle" :visible.sync="dialogVisible" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item
          v-if="dialogStatus === 'create'"
          :label="$t('systemUser.username')"
          prop="username"
        >
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item
          v-if="dialogStatus === 'create'"
          :label="$t('login.password')"
          prop="password"
        >
          <el-input v-model="form.password" show-password />
        </el-form-item>
        <el-form-item :label="$t('systemUser.name')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="$t('systemUser.roles')" prop="roles">
          <el-select v-model="form.roles" multiple style="width: 100%">
            <el-option label="admin" value="admin" />
            <el-option label="operator" value="operator" />
            <el-option label="viewer" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('systemUser.tenantId')" prop="tenantId">
          <el-input v-model="form.tenantId" />
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="dialogVisible = false">{{ $t('browser.cancel') }}</el-button>
        <el-button type="primary" @click="submitForm">{{ $t('browser.confirm') }}</el-button>
      </div>
    </el-dialog>

    <el-dialog
      :title="$t('systemUser.assignBrowsersTitle')"
      :visible.sync="assignDialogVisible"
      width="640px"
    >
      <p class="assign-hint">{{ $t('systemUser.assignBrowsersHint') }}</p>
      <p v-if="assignTargetUser" class="assign-target">
        {{ assignTargetUser.name }}（{{ assignTargetUser.username }}）
      </p>
      <div class="assign-filter">
        <el-input
          v-model="assignQuery.q"
          clearable
          placeholder="搜索名称 / 序号"
          style="width: 240px"
          @keyup.enter.native="handleAssignSearch"
        />
        <el-button type="primary" icon="el-icon-search" @click="handleAssignSearch">
          {{ $t('browser.search') }}
        </el-button>
      </div>
      <div v-loading="assignLoading">
        <el-empty
          v-if="!assignLoading && !allEnvironments.length"
          :description="$t('systemUser.assignBrowsersEmpty')"
        />
        <el-checkbox-group v-else v-model="selectedEnvIds" class="env-checkbox-group">
          <el-checkbox
            v-for="env in allEnvironments"
            :key="String(env.id)"
            :label="String(env.id)"
            class="env-checkbox-item"
          >
            #{{ env.id }} {{ env.name }}
            <span v-if="envOwnerLabel(env.ownerId)" class="env-owner-tag">
              · {{ envOwnerLabel(env.ownerId) }}
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <pagination
        v-show="assignTotal > 0"
        :total="assignTotal"
        :page.sync="assignQuery.page"
        :limit.sync="assignQuery.limit"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @pagination="loadAssignPage"
      />
      <div slot="footer">
        <el-button @click="assignDialogVisible = false">{{ $t('browser.cancel') }}</el-button>
        <el-button type="primary" :loading="assignSaving" @click="submitAssignBrowsers">
          {{ $t('browser.confirm') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import {
  fetchUserList,
  createUser,
  updateUser,
  resetUserPassword,
  disableUser,
  assignUserEnvironments
} from '@/api/system-user'
import { fetchAssignOptions } from '@/api/environment'
import Pagination from '@/components/Pagination'

const emptyForm = () => ({
  id: '',
  username: '',
  password: '',
  name: '',
  roles: ['viewer'],
  tenantId: '1'
})

export default {
  name: 'SystemUsers',
  components: { Pagination },
  data() {
    return {
      list: [],
      listLoading: false,
      dialogVisible: false,
      dialogStatus: 'create',
      form: emptyForm(),
      rules: {
        username: [{ required: true, message: '必填', trigger: 'blur' }],
        password: [{ required: true, message: '必填', trigger: 'blur' }],
        name: [{ required: true, message: '必填', trigger: 'blur' }],
        roles: [{ required: true, message: '必选', trigger: 'change' }]
      },
      assignDialogVisible: false,
      assignLoading: false,
      assignSaving: false,
      assignTargetUser: null,
      allEnvironments: [],
      selectedEnvIds: [],
      assignTotal: 0,
      assignQuery: {
        page: 1,
        limit: 20,
        q: ''
      },
      assignSelectionInitialized: false
    }
  },
  computed: {
    dialogTitle() {
      return this.dialogStatus === 'create' ? this.$t('systemUser.add') : this.$t('browser.edit')
    }
  },
  created() {
    this.getList()
  },
  methods: {
    async getList() {
      this.listLoading = true
      try {
        const res = await fetchUserList()
        this.list = res.data || []
      } finally {
        this.listLoading = false
      }
    },
    handleCreate() {
      this.dialogStatus = 'create'
      this.form = emptyForm()
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate())
    },
    handleUpdate(row) {
      this.dialogStatus = 'update'
      this.form = {
        id: row.id,
        username: row.username,
        password: '',
        name: row.name,
        roles: [...row.roles],
        tenantId: row.tenantId
      }
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate())
    },
    submitForm() {
      this.$refs.formRef.validate(async valid => {
        if (!valid) return
        if (this.dialogStatus === 'create') {
          await createUser({
            username: this.form.username,
            password: this.form.password,
            name: this.form.name,
            roles: this.form.roles,
            tenantId: this.form.tenantId
          })
          this.$message.success('创建成功')
        } else {
          await updateUser(this.form.id, {
            name: this.form.name,
            roles: this.form.roles,
            tenantId: this.form.tenantId
          })
          this.$message.success('更新成功')
        }
        this.dialogVisible = false
        this.getList()
      })
    },
    handleResetPassword(row) {
      this.$prompt(this.$t('systemUser.resetPasswordPrompt'), this.$t('systemUser.resetPassword'), {
        inputType: 'password'
      })
        .then(async ({ value }) => {
          await resetUserPassword(row.id, value)
          this.$message.success('密码已重置')
        })
        .catch(() => {})
    },
    handleDisable(row) {
      this.$confirm(this.$t('systemUser.disableConfirm'), this.$t('browser.delete'), {
        type: 'warning'
      })
        .then(async () => {
          await disableUser(row.id)
          this.$message.success('已禁用')
          this.getList()
        })
        .catch(() => {})
    },
    envOwnerLabel(ownerId) {
      if (!ownerId) return ''
      const user = this.list.find(u => u.id === ownerId)
      return user ? user.name || user.username : ''
    },
    async handleAssignBrowsers(row) {
      if (row.disabled) {
        this.$message.warning('已禁用用户无法分配环境')
        return
      }
      this.assignTargetUser = row
      this.assignDialogVisible = true
      this.selectedEnvIds = []
      this.assignSelectionInitialized = false
      this.assignQuery = { page: 1, limit: 20, q: '' }
      this.assignTotal = 0
      this.allEnvironments = []
      if (!this.list || !this.list.length) {
        const usersRes = await fetchUserList()
        this.list = usersRes.data || []
      }
      await this.loadAssignPage({ resetSelection: true })
    },
    handleAssignSearch() {
      this.assignQuery.page = 1
      this.loadAssignPage()
    },
    async loadAssignPage(options = {}) {
      if (!this.assignTargetUser) return
      this.assignLoading = true
      try {
        const res = await fetchAssignOptions({
          page: this.assignQuery.page || 1,
          limit: this.assignQuery.limit || 20,
          q: (this.assignQuery.q || '').trim() || undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          targetUserId: this.assignTargetUser.id
        })
        const data = res.data || {}
        // 兼容旧接口（数组）与新分页结构
        if (Array.isArray(data)) {
          this.allEnvironments = data
          this.assignTotal = data.length
          if (options.resetSelection || !this.assignSelectionInitialized) {
            this.selectedEnvIds = data
              .filter(env => env.ownerId === this.assignTargetUser.id)
              .map(env => String(env.id))
            this.assignSelectionInitialized = true
          }
        } else {
          this.allEnvironments = Array.isArray(data.items) ? data.items : []
          this.assignTotal = Number(data.total) || 0
          if (options.resetSelection || !this.assignSelectionInitialized) {
            const assigned = Array.isArray(data.assignedIds) ? data.assignedIds : []
            this.selectedEnvIds = assigned.map(id => String(id))
            this.assignSelectionInitialized = true
          }
        }
      } finally {
        this.assignLoading = false
      }
    },
    async submitAssignBrowsers() {
      if (!this.assignTargetUser) return
      this.assignSaving = true
      try {
        await assignUserEnvironments(this.assignTargetUser.id, this.selectedEnvIds)
        this.$message.success(this.$t('systemUser.assignBrowsersSuccess'))
        this.assignDialogVisible = false
      } finally {
        this.assignSaving = false
      }
    }
  }
}
</script>

<style scoped>
.assign-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: #909399;
}
.assign-target {
  margin: 0 0 12px;
  font-weight: 600;
}
.assign-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.env-checkbox-group {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
}
.env-checkbox-item {
  margin: 0 0 8px;
}
.env-owner-tag {
  color: #909399;
  font-size: 12px;
}
</style>
