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
      width="560px"
    >
      <p class="assign-hint">{{ $t('systemUser.assignBrowsersHint') }}</p>
      <p v-if="assignTargetUser" class="assign-target">
        {{ assignTargetUser.name }}（{{ assignTargetUser.username }}）
      </p>
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
import { fetchEnvironments } from '@/api/environment'

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
      selectedEnvIds: []
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
      this.assignLoading = true
      this.selectedEnvIds = []
      try {
        const [usersRes, envRes] = await Promise.all([fetchUserList(), fetchEnvironments()])
        this.list = usersRes.data || []
        this.allEnvironments = envRes.data || []
        this.selectedEnvIds = this.allEnvironments
          .filter(env => env.ownerId === row.id)
          .map(env => String(env.id))
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
  margin: 0 0 16px;
  font-weight: 600;
}
.env-checkbox-group {
  display: flex;
  flex-direction: column;
  max-height: 360px;
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
