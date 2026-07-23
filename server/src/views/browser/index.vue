<template>
  <div class="app-container">
    <div class="toolbar">
      <div class="toolbar-primary">
        <el-button
          v-permission="['admin', 'operator']"
          type="primary"
          icon="el-icon-circle-plus"
          @click="handleCreate"
        >
          {{ $t('browser.add') }}
        </el-button>
        <el-dropdown v-permission="['admin', 'operator']" :disabled="batchBusy">
          <el-button type="primary" :loading="batchBusy">
            {{ $t('browser.batchActions') }}
            <i class="el-icon-arrow-down el-icon--right" />
          </el-button>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item @click.native="handleBatchStart">
              {{ $t('browser.batchStart') }}
            </el-dropdown-item>
            <el-dropdown-item @click.native="() => (dialogVisible = true)">
              {{ $t('browser.batchCreate') }}
            </el-dropdown-item>
            <el-dropdown-item v-permission="['admin']" @click.native="handleBatchDelete">
              {{ $t('browser.batchDelete') }}
            </el-dropdown-item>
            <el-dropdown-item @click.native="handleBatchSetGroup">
              {{ $t('browser.batchGroup') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
      </div>
      <div class="toolbar-filters">
        <el-select
          v-model="listQuery.group"
          filterable
          clearable
          class="toolbar-select"
          :placeholder="$t('group.filter')"
          @change="handleFilter"
        >
          <el-option v-for="item in GroupList" :key="item.id" :value="item.name" />
        </el-select>
        <el-input
          v-model="listQuery.title"
          class="toolbar-input"
          :placeholder="$t('browser.search_placeholder')"
          clearable
          @keyup.enter.native="handleFilter"
          @clear="handleFilter"
        />
        <el-button v-waves plain icon="el-icon-search" @click="handleFilter">
          {{ $t('browser.search') }}
        </el-button>
      </div>
      <div class="toolbar-secondary">
        <el-button plain @click="showSettingsDialog">IP查询API设置</el-button>
        <el-upload
          v-permission="['admin', 'operator']"
          action=""
          accept=".json"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onImport"
        >
          <el-button plain>{{ $t('browser.import.import') }}</el-button>
        </el-upload>
        <el-button v-permission="['admin', 'operator']" plain @click="onExport">
          {{ $t('browser.import.export') }}
        </el-button>
      </div>
    </div>

    <el-table
      ref="browserTable"
      :key="tableKey"
      v-loading="listLoading || batchBusy"
      :data="pagedList"
      :height="tableHeight"
      :row-key="getRowKey"
      fit
      class="browser-table"
      @selection-change="handleSelectionChange"
      @select="handleSelect"
      @select-all="handleSelectAll"
    >
      <el-table-column type="selection" width="60" align="center" reserve-selection />
      <el-table-column :label="$t('browser.id')" prop="id" sortable align="center" width="80">
        <template slot-scope="{ row }">
          <span>{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('browser.name')" min-width="80px">
        <template slot-scope="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('group.group')" min-width="50px">
        <template slot-scope="{ row }">
          <el-tooltip class="item" effect="dark" content="点击编辑分组" placement="top">
            <el-button
              v-permission="['admin', 'operator']"
              type="text"
              @click="handleEditGroup(row)"
            >
              {{ row.group }}
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="代理" width="210px" show-overflow-tooltip>
        <template slot-scope="{ row }">
          <span class="proxy-cell">{{ formatProxyLabel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="$t('browser.date')"
        sortable
        prop="timestamp"
        width="150px"
        align="center"
      >
        <template slot-scope="{ row }">
          <span>{{ row.timestamp | parseTime('{y}-{m}-{d} {h}:{i}') }}</span>
        </template>
      </el-table-column>

      <el-table-column :label="$t('browser.cloudSync')" width="170" align="center">
        <template slot-scope="{ row }">
          <div v-if="row.syncLoading" v-loading="true" class="sync-loading" />
          <div v-else class="sync-cell">
            <el-tooltip v-if="row.syncStatus" effect="dark" placement="top">
              <div slot="content" class="sync-tooltip">
                <div>{{ formatSyncVersion(row.syncStatus) }}</div>
                <div>{{ $t('browser.cloudSyncHint') }}</div>
              </div>
              <div class="sync-status-block">
                <el-tag :type="syncStatusTagType(row.syncStatus.status)" size="mini">
                  {{ syncStatusLabel(row.syncStatus.status) }}
                </el-tag>
                <div class="sync-version-hint">{{ formatSyncVersion(row.syncStatus) }}</div>
              </div>
            </el-tooltip>
            <span v-else>—</span>
            <el-dropdown
              v-permission="['admin', 'operator']"
              trigger="click"
              class="sync-dropdown"
              @command="cmd => handleSyncCommand(cmd, row)"
            >
              <el-button size="mini" plain :loading="row.syncActionLoading">
                {{ $t('browser.cloudSync') }}
                <i class="el-icon-arrow-down el-icon--right" />
              </el-button>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item command="upload">
                  {{ $t('browser.cloudSyncUpload') }}
                </el-dropdown-item>
                <el-dropdown-item command="pull">
                  {{ $t('browser.cloudSyncPull') }}
                </el-dropdown-item>
                <el-dropdown-item command="refresh" divided>
                  {{ $t('browser.cloudSyncRefresh') }}
                </el-dropdown-item>
                <el-dropdown-item disabled>
                  <span class="sync-scope-hint">{{ $t('browser.cloudSyncHint') }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        :label="$t('browser.launch')"
        class-name="status-col"
        width="220"
        fixed="right"
      >
        <template slot-scope="{ row }">
          <el-button
            type="primary"
            icon="el-icon-video-play"
            :loading="row.runLoading"
            :disabled="row.isRunning || isRowBusy(row)"
            @click="handleLaunch(row)"
          >
            {{
              $t(
                row.runLoading
                  ? 'browser.launching'
                  : row.isRunning
                  ? 'browser.launched'
                  : 'browser.launch'
              )
            }}
          </el-button>
          <el-button
            v-if="row.isRunning"
            plain
            size="mini"
            icon="el-icon-monitor"
            :loading="row.debugLoading"
            :disabled="isRowBusy(row)"
            @click="handleOpenDebug(row)"
          >
            {{ $t('browser.openDebug') }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        :label="$t('browser.actions')"
        align="center"
        width="160"
        fixed="right"
        class-name="small-padding fixed-width"
      >
        <template slot-scope="{ row, $index }">
          <el-button
            v-permission="['admin', 'operator']"
            plain
            size="mini"
            :disabled="isRowBusy(row)"
            @click="handleUpdate(row)"
          >
            {{ $t('browser.edit') }}
          </el-button>
          <el-button
            v-if="row.status != 'deleted'"
            v-permission="['admin']"
            type="text"
            class="action-delete"
            :loading="row.deleteLoading"
            :disabled="isRowBusy(row) && !row.deleteLoading"
            @click="handleDelete(row, $index)"
          >
            {{ $t('browser.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="list && list.length > 0"
      :total="list.length"
      :page.sync="listQuery.page"
      :limit.sync="listQuery.limit"
    />

    <el-drawer
      :title="$t(dialogStatus == 'create' ? 'browser.add' : 'browser.edit')"
      :visible.sync="dialogFormVisible"
      :close-on-click-modal="false"
      class="formDlg"
      size="800px"
    >
      <div class="drawer-content">
        <div class="form-wrap">
          <el-form
            ref="dataForm"
            :rules="rules"
            :model="form"
            label-position="left"
            label-width="100px"
          >
            <el-timeline>
              <el-timeline-item>
                <h3>{{ $t('browser.basic') }}</h3>
                <div>
                  <el-form-item :label="$t('browser.name')" prop="name">
                    <el-input v-model="form.name" :placeholder="$t('browser.name_placeholder')" />
                  </el-form-item>
                  <el-form-item :label="$t('browser.group')">
                    <el-select v-model="form.group" :placeholder="$t('browser.select')">
                      <el-option v-for="item in GroupList" :key="item.id" :value="item.name" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.crxExtensions')">
                    <el-select
                      v-model="form.crxIds"
                      multiple
                      filterable
                      clearable
                      :placeholder="$t('browser.crxExtensionsPlaceholder')"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="crx in crxOptions"
                        :key="crx.id"
                        :label="crx.name"
                        :value="String(crx.id)"
                        :disabled="crx.enabled === false"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.platform')">
                    <el-radio-group v-model="form.os">
                      <el-radio-button v-for="item in platforms" :key="item" :label="item" />
                    </el-radio-group>
                    <div class="tips">{{ $t('browser.platform_tips') }}</div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.version')">
                    <el-select v-model="form.chrome_version" :placeholder="$t('browser.select')">
                      <el-option v-for="item in Versions" :key="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.proxy.setting')">
                    <el-radio-group v-model="form.proxy.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.no_proxy') }}</el-radio-button>
                      <el-radio-button :label="2">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <div v-if="form.proxy.mode == 2" style="margin-top: 10px">
                      <el-form-item :label="$t('browser.proxy.protocol')" label-width="70px">
                        <el-select v-model="form.proxy.protocol" style="width: 100px">
                          <el-option value="HTTP" />
                          <el-option value="HTTPS" />
                          <el-option value="SOCKS5" />
                        </el-select>
                      </el-form-item>
                      <el-form-item
                        :label="$t('browser.proxy.host')"
                        label-width="70px"
                        prop="proxy.host"
                      >
                        <el-input v-model="form.proxy.host" style="max-width: 250px" />
                        :
                        <el-input
                          v-model="form.proxy.port"
                          style="width: 70px"
                          :placeholder="$t('browser.proxy.port')"
                        />
                        <span style="font-size: 12px; margin-left: 10px; color: rgb(141, 133, 133)">
                          可按‘主机:端口:账号:密码’或‘主机:端口’格式粘贴自动识别
                        </span>
                      </el-form-item>
                      <el-form-item :label="$t('browser.proxy.user')" label-width="70px">
                        <el-input v-model="form.proxy.user" style="max-width: 250px" />
                      </el-form-item>
                      <el-form-item :label="$t('browser.proxy.pass')" label-width="70px">
                        <el-input v-model="form.proxy.pass" style="max-width: 250px" />
                        &nbsp;
                        <el-button
                          type="primary"
                          style="margin-left: 7px"
                          :disabled2="checkProxyState.checking"
                          :loading="checkProxyState.checking"
                          @click="checkProxy"
                        >
                          检测{{ checkProxyState.checking ? '中' : '' }}
                        </el-button>
                      </el-form-item>
                      <el-form-item :label="$t('browser.proxy.API')" label-width="70px">
                        <el-input v-model="form.proxy.API" style="max-width: 250px" />
                        &nbsp;
                        <el-button type="primary" style="margin-left: 7px" @click="checkAPIProxy">
                          提取代理
                        </el-button>
                      </el-form-item>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.cookie.jsonStr')" prop="cookie.jsonStr">
                    <el-switch v-model="form.cookie.mode" :active-value="1" :inactive-value="0" />
                    <div style="display: flex; align-items: flex-start">
                      <el-input
                        v-model="form.cookie.jsonStr"
                        type="textarea"
                        rows="6"
                        :placeholder="$t('browser.cookie.placeholder')"
                        :disabled="form.cookie.mode === 0"
                      />
                      <el-button
                        type="text"
                        style="margin: -5px 0 0 5px"
                        @click="dialogCookieFormatVisible = true"
                      >
                        {{ $t('browser.cookie.format') }}
                      </el-button>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.homepage')">
                    <el-radio-group v-model="form.homepage.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <el-input
                      v-if="form.homepage.mode === 1"
                      v-model="form.homepage.value"
                      :placeholder="$t('browser.homepage_tips')"
                      style="width: 424px; margin-left: 10px"
                    />
                  </el-form-item>
                </div>
              </el-timeline-item>
              <el-timeline-item>
                <h3>{{ $t('browser.advanced') }}</h3>
                <div>
                  <el-form-item :label="$t('browser.ua')">
                    <el-radio-group v-model="form.ua.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <div style="display: flex; align-items: flex-start; margin-top: 3px">
                      <div style="flex-grow: 1; margin-right: 10px">
                        <el-input
                          v-model="form.ua.value"
                          :disabled="form.ua.mode === 0"
                          type="textarea"
                          style="width: 100%"
                        />
                      </div>
                      <el-button
                        type="primary"
                        size="small"
                        icon="el-icon-refresh"
                        :disabled="form.ua.mode === 0"
                        @click="RandomFingerprint"
                      >
                        {{ $t('browser.random') }}
                      </el-button>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.sec_ua')">
                    <el-radio-group v-model="form['sec-ch-ua'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <div v-show="form['sec-ch-ua'].mode === 1" class="custom-sec-ua">
                      <div v-for="(item, i) in form['sec-ch-ua'].value" :key="i" class="item">
                        <el-form-item label="brand: " label-width="42px">
                          <el-input v-model="item.brand" />
                        </el-form-item>
                        <el-form-item label="version: " label-width="52px">
                          <el-input v-model="item.version" style="width: 60px" />
                        </el-form-item>
                        <el-button
                          type="danger"
                          icon="el-icon-minus"
                          circle
                          @click="onRemoveBrand(item.brand)"
                        />
                      </div>
                      <div class="item">
                        <el-form-item label="brand: " label-width="42px" style="visibility: hidden">
                          <el-input />
                        </el-form-item>
                        <el-form-item
                          label="version: "
                          label-width="52px"
                          style="visibility: hidden"
                        >
                          <el-input style="width: 60px" />
                        </el-form-item>
                        <el-button
                          type="success"
                          icon="el-icon-plus"
                          circle
                          @click="onAddBrand()"
                        />
                      </div>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.language')">
                    <el-switch
                      v-model="form['ua-language'].mode"
                      :active-value="2"
                      :inactive-value="1"
                    />
                    <span style="margin-left: 10px">{{ $t('browser.language_tips') }}</span>
                    <el-select
                      v-if="form['ua-language'].mode == 1"
                      v-model="form['ua-language'].language"
                      :placeholder="$t('browser.select')"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="(item, i) in Languages"
                        :key="i"
                        :label="(language == 'zh' ? item.lang : item.en) + '    ' + item.code"
                        :value="item.code"
                      >
                        <span style="float: left">
                          {{ language == 'zh' ? item.lang : item.en }}
                        </span>
                        <span style="float: right; color: #8492a6; font-size: 13px">
                          {{ item.code }}
                        </span>
                      </el-option>
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.timezone')">
                    <el-switch
                      v-model="form['time-zone'].mode"
                      :active-value="2"
                      :inactive-value="1"
                    />
                    <span style="margin-left: 10px">{{ $t('browser.timezone_tips') }}</span>
                    <el-select
                      v-if="form['time-zone'].mode == 1"
                      v-model="form['time-zone'].name"
                      :placeholder="$t('browser.select')"
                      style="width: 100%"
                      @change="
                        select => {
                          const selItem = TimeZones.find(item => item.text == select)
                          form['time-zone'].value = selItem.offset
                          form['time-zone'].zone = getZone(selItem.offset)
                          form['time-zone'].utc = selItem.utc[0]
                        }
                      "
                    >
                      <el-option v-for="(item, i) in TimeZones" :key="i" :value="item.text" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.webrtc')">
                    <el-radio-group v-model="form.webrtc.mode">
                      <el-radio-button :label="0">{{ $t('browser.replace') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.allow') }}</el-radio-button>
                      <el-radio-button :label="2">{{ $t('browser.block') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.location')">
                    <el-radio-group v-model="form.location.enable">
                      <el-radio-button label="0">{{ $t('browser.ask') }}</el-radio-button>
                      <el-radio-button label="1">{{ $t('browser.allow') }}</el-radio-button>
                      <el-radio-button label="2">{{ $t('browser.block') }}</el-radio-button>
                    </el-radio-group>
                    <div v-if="form.location.enable != 2">
                      <el-switch
                        v-model="form.location.mode"
                        :active-value="2"
                        :inactive-value="1"
                      />
                      <span style="margin-left: 10px">{{ $t('browser.location_tips') }}</span>
                      <div v-if="form.location.mode == 1">
                        <el-form-item :label="$t('browser.longitude')" label-width="80px">
                          <el-input v-model="form.location.longitude" style="width: 100px" />
                        </el-form-item>
                        <el-form-item :label="$t('browser.latitude')" label-width="80px">
                          <el-input v-model="form.location.latitude" style="width: 100px" />
                        </el-form-item>
                        <el-form-item :label="$t('browser.precision')" label-width="80px">
                          <el-input v-model="form.location.precision" style="width: 100px" />
                        </el-form-item>
                      </div>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.screen')">
                    <el-radio-group v-model="form.screen.mode">
                      <el-radio-button :label="0">{{ $t('browser.system_match') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <el-select
                      v-if="form.screen.mode === 1"
                      v-model="form.screen._value"
                      :placeholder="$t('browser.select')"
                      style="margin-left: 10px"
                    >
                      <el-option
                        v-for="(item, i) in resolutionList"
                        :key="i"
                        :value="item"
                        :label="item"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="$t('browser.fonts')">
                    <el-radio-group v-model="form.fonts.mode">
                      <el-radio-button :label="0">
                        {{ $t('browser.system_default') }}
                      </el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random_match') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.canvas')">
                    <el-radio-group v-model="form.canvas.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.webgl_img')">
                    <el-radio-group v-model="form['webgl-img'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.webgl')">
                    <el-radio-group v-model="form.webgl.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <template v-if="form.webgl.mode == 1">
                    <el-form-item :label="$t('browser.webgl_manu')">
                      <el-select v-model="form.webgl.vendor" :placeholder="$t('browser.select')">
                        <el-option v-for="(item, i) in WebGLVendors" :key="i" :value="item" />
                        <!-- <el-option value="Google Inc. (NVIDIA)" /> -->
                      </el-select>
                    </el-form-item>
                    <el-form-item :label="$t('browser.webgl_render')">
                      <el-select
                        v-model="form.webgl.render"
                        :placeholder="$t('browser.select')"
                        style="width: 100%"
                      >
                        <el-option v-for="(item, i) in WebGLRenders" :key="i" :value="item" />
                      </el-select>
                    </el-form-item>
                  </template>
                  <el-form-item :label="$t('browser.audio')">
                    <el-radio-group v-model="form['audio-context'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <!-- <el-form-item :label="$t('browser.media')">
                <el-radio-group v-model="form.media.mode">
                  <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                  <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                </el-radio-group>
              </el-form-item> -->
                  <el-form-item :label="$t('browser.client_rects')">
                    <el-radio-group v-model="form['client-rects'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.speech_voices')">
                    <el-radio-group v-model="form['speech_voices'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.random') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.cpu')">
                    <el-select v-model="form.cpu.value" style="width: 60px">
                      <el-option :value="2" />
                      <el-option :value="4" />
                      <el-option :value="6" />
                      <el-option :value="8" />
                      <el-option :value="12" />
                    </el-select>
                    &nbsp;
                    <span>{{ $t('browser.cpu_unit') }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('browser.memory')">
                    <el-select v-model="form.memory.value" style="width: 60px">
                      <el-option :value="2" />
                      <el-option :value="4" />
                      <el-option :value="8" />
                      <el-option :value="16" />
                      <el-option :value="32" />
                      <el-option :value="64" />
                    </el-select>
                    &nbsp;
                    <span>GB</span>
                  </el-form-item>
                  <el-form-item :label="$t('browser.device')" style="height: 36px">
                    <el-radio-group v-model="form['device-name'].mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <div v-if="form['device-name'].mode == 1" style="display: inline-block">
                      <el-input
                        v-model="form['device-name'].value"
                        style="width: 200px; margin-left: 10px"
                      />
                      <el-button type="text" @click="onReRandomComputerName">
                        {{ $t('browser.random_change') }}
                      </el-button>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.mac')" style="height: 36px">
                    <el-radio-group v-model="form.mac.mode">
                      <el-radio-button :label="0">{{ $t('browser.default') }}</el-radio-button>
                      <el-radio-button :label="1">{{ $t('browser.custom') }}</el-radio-button>
                    </el-radio-group>
                    <div v-if="form.mac.mode == 1" style="display: inline-block">
                      <el-input v-model="form.mac.value" style="width: 200px; margin-left: 10px" />
                      <el-button type="text" @click="onReRandomAddr">
                        {{ $t('browser.random_change') }}
                      </el-button>
                    </div>
                  </el-form-item>
                  <el-form-item :label="$t('browser.dnt')">
                    <el-switch v-model="form.dnt.value" :active-value="1" :inactive-value="0" />
                  </el-form-item>
                  <el-form-item :label="$t('browser.ssl')">
                    <el-radio-group v-model="form.ssl.mode">
                      <el-radio-button :label="1">{{ $t('browser.enable') }}</el-radio-button>
                      <el-radio-button :label="0">{{ $t('browser.disable') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item v-if="form.ssl.mode == 1" :label="$t('browser.ssl_disabled')">
                    <el-checkbox-group v-model="form.ssl.value">
                      <el-checkbox v-for="(val, key) in SSL" :key="key" :label="val">
                        {{ key }}
                      </el-checkbox>
                    </el-checkbox-group>
                  </el-form-item>
                  <el-form-item :label="$t('browser.port_scan')">
                    <el-radio-group v-model="form['port-scan'].mode">
                      <el-radio-button :label="1">{{ $t('browser.enable') }}</el-radio-button>
                      <el-radio-button :label="0">{{ $t('browser.disable') }}</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item
                    v-if="form['port-scan'].mode == 1"
                    :label="$t('browser.enable_ports')"
                  >
                    <el-input
                      :value="form['port-scan'].value.join(',')"
                      :placeholder="$t('browser.enable_ports_tips')"
                      @input="value => (form['port-scan'].value = value.split(','))"
                      @change="
                        value =>
                          (form['port-scan'].value = value
                            .split(',')
                            .filter(item => /^\d+$/.test(item)))
                      "
                    />
                  </el-form-item>
                  <el-form-item :label="$t('browser.gpu')">
                    <el-switch v-model="form.gpu.value" :active-value="1" :inactive-value="0" />
                  </el-form-item>
                </div>
              </el-timeline-item>
              <el-timeline-item :hide-timestamp="true" />
            </el-timeline>
          </el-form>
        </div>
        <div class="dialog-footer">
          <el-button size="medium" @click="dialogFormVisible = false">
            {{ $t('browser.cancel') }}
          </el-button>
          <el-button
            type="primary"
            size="medium"
            :loading="formSubmitLoading"
            @click="dialogStatus === 'create' ? onCreateData() : onUpdateData()"
          >
            {{ $t('browser.confirm') }}
          </el-button>
        </div>
      </div>
    </el-drawer>
    <el-dialog
      :visible.sync="dialogCookieFormatVisible"
      :title="$t('browser.cookie.format_title')"
      class="dialog-cookie"
    >
      <el-input v-model="cookieFormat" type="textarea" :rows="19" />
      <span slot="footer" class="dialog-footer">
        <el-tooltip
          v-model="copied"
          :manual="true"
          :hide-after="3000"
          :content="$t('browser.cookie.copied')"
          placement="top"
        >
          <el-button v-clipboard="() => cookieFormat" v-clipboard:success="onCopy" type="primary">
            {{ $t('browser.cookie.copy') }}
          </el-button>
        </el-tooltip>
        <el-button @click="dialogCookieFormatVisible = false">
          {{ $t('browser.cookie.close') }}
        </el-button>
      </span>
    </el-dialog>
    <el-dialog :visible.sync="dialogVisible" title="批量创建">
      <el-form :model="batchForm">
        <el-form-item label="环境数量">
          <el-input v-model.number="batchForm.numberOfEnvironments" type="number" min="1" />
        </el-form-item>
        <el-form-item label="代理类型">
          <el-select v-model="batchForm.proxyType" placeholder="请选择">
            <el-option label="默认" value="默认" />
            <el-option label="不使用代理" value="不使用代理" />
            <el-option label="HTTP" value="HTTP" />
            <el-option label="HTTPS" value="HTTPS" />
            <el-option label="SOCKS5" value="SOCKS5" />
          </el-select>
        </el-form-item>
        <el-form-item label="代理API链接">
          <el-input v-model="batchForm.proxyAPI" placeholder="请输入" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button :disabled="batchBusy" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchBusy" @click="handleBatchCreate">确认</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="showSetDialog" title="IP查询API设置" :visible.sync="showSetDialog">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        title="默认使用自建 IP 库（cloudApiBase + /api/ip-geo）。此项不是云端登录地址；也可改选 VirtualBrowser / ipgeoLocation 并填写对应完整 URL。"
      />
      <el-form :model="form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="查询渠道">
              <el-select v-model="Channel" placeholder="请选择">
                <el-option label="自建" value="selfhost" />
                <el-option label="VirtualBrowser" value="virtualbrowser" />
                <el-option label="ipgeoLocation" value="ipgeolocation" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <div v-if="Channel === 'virtualbrowser'">
              点击
              <a href="https://virtualbrowser.cc" target="_blank" style="color: #42b983">官网</a>
              获取API Key
            </div>
            <div
              v-else-if="Channel === 'ipgeolocation'"
              style="color: #909399; font-size: 13px; line-height: 1.5"
            >
              需填写 ipgeolocation.io 完整 URL（含 apiKey）
            </div>
            <div
              v-else-if="Channel === 'selfhost'"
              style="color: #909399; font-size: 13px; line-height: 1.5"
            >
              未填写时自动使用 cloudApiBase + /api/ip-geo
              <br />
              一般无需再去第三方官网申请 Key
            </div>
          </el-col>
        </el-row>
        <el-input v-model="apiLink" placeholder="自建可留空（自动推导）；或填写完整 URL" />
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="showSetDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </span>
    </el-dialog>

    <el-dialog :title="'编辑分组'" :visible.sync="dialogBatchSetGroupVisible" width="30%">
      <el-form>
        <el-form-item :label="$t('browser.group')">
          <el-select v-model="selectedGroup" :placeholder="$t('browser.select')">
            <el-option v-for="item in GroupList" :key="item.id" :value="item.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogBatchSetGroupVisible = false">取消</el-button>
        <el-button type="primary" @click="applyBatchSetGroup">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {
  getBrowserList,
  getGlobalData,
  setGlobalData,
  getDefaultIpGeoApiLink,
  addBrowser,
  batchAddBrowsers,
  batchDeleteBrowsers,
  batchSetBrowserGroup,
  updateBrowser,
  deleteBrowser,
  chromeSend,
  chromeSendTimeout,
  updateRuningState,
  onBrowserExited,
  getGroupList,
  addGroup,
  getLocalCrxList,
  getProfileSyncStatus,
  syncProfileToCloud,
  syncProfileFromCloud
} from '@/api/native'
import { saveAs } from 'file-saver'
import waves from '@/directive/waves' // waves directive
import random from 'random'
import {
  // parseTime,
  genRandomMacAddr,
  genRandomComputerName,
  genRandomSpeechVoices,
  getRandomCpuCore,
  getRandomMemorySize,
  genUserAgent,
  getUaFullVersion,
  loadScript,
  FINGERPRINT_PLATFORMS
} from '@/utils'
import Pagination from '@/components/Pagination' // secondary package based on el-pagination
import TimeZones from '@/utils/timezones.json'
import Languages from '@/utils/languages.json'
import SSL from '@/utils/ssl.json'
import Versions from '@/utils/versions.json'
import uaFullVersions from '@/utils/ua-full-versions.json'
import WebGLRenders from '@/utils/webgl.json'
import { getFontList } from '@/utils/fonts'
import { compareVersions } from 'compare-versions'
import { normalizeCookieEntry, normalizeCookieList } from '@lib/cookie-normalize'

let IPGeo = {}
let fontList = []
let currentOs = 'Win 11'
let chromeVer = ''
// const sslList = ['0xc02c', '0xa02c', '0xb02c', '0xd02c', '0xe02c', '0xf02c']
let tooltipTimer
const chromiumCoreVer =
  Number(navigator.userAgentData.brands.find(item => item.brand === 'Chromium')?.version) || 117
const coreVersions = Array.from(new Set(Versions.map(item => Number(item.split('.')[0]))))
for (let i = Math.max(...coreVersions) + 1; i <= chromiumCoreVer; i++) {
  coreVersions.unshift(i)
  Versions.unshift(`${i}.0.0.0`)
}

export default {
  name: 'ComplexTable',
  components: {
    Pagination
  },
  directives: { waves },
  filters: {
    statusFilter(status) {
      const statusMap = {
        published: 'success',
        draft: 'info',
        deleted: 'danger'
      }
      return statusMap[status]
    }
  },
  data() {
    const validateCookie = (rule, value, callback) => {
      try {
        if (this.form.cookie.mode === 0) {
          callback()
          return
        }

        let json
        try {
          // eslint-disable-next-line no-eval
          json = eval(`(${value})`)
        } catch {
          callback(new Error(this.$t('browser.cookie.format_error')))
          return
        }

        if (Object.prototype.toString.call(json) !== '[object Array]') {
          callback(new Error(this.$t('browser.cookie.format_error')))
          return
        }

        const setDefaultValue = (obj, key, defaultVal) => {
          if (obj[key] === undefined) {
            obj[key] = defaultVal
          }
        }

        json = json.map(item => {
          if (!item || typeof item !== 'object') {
            throw new Error('invalid_cookie_item')
          }
          const cookie = {}
          Object.keys(item).forEach(key => {
            let newKey = key.substring(0, 1).toLowerCase() + key.substring(1)
            if (newKey === 'samesite') {
              newKey = 'sameSite'
            }
            cookie[newKey] = item[key]
          })

          setDefaultValue(cookie, 'sameSite', '')
          setDefaultValue(cookie, 'session', false)
          setDefaultValue(cookie, 'secure', false)
          setDefaultValue(cookie, 'httpOnly', false)

          return normalizeCookieEntry(cookie)
        })

        const checkNameValue = json.every(item => {
          return item.name && item.value && item.domain
        })

        if (!checkNameValue) {
          callback(new Error(this.$t('browser.cookie.format_error')))
          return
        }

        this.form.cookie.value = json
        // Rewrite jsonStr so the user sees sanitized domain / SameSite+Secure
        this.form.cookie.jsonStr = JSON.stringify(json, null, 2)
        callback()
      } catch (e) {
        callback(new Error(this.$t('browser.cookie.format_error')))
      }
    }
    return {
      currentEditingRow: null,
      showSetDialog: false,
      showSetApiDialog: false,
      dialogBatchSetGroupVisible: false,
      selectedGroup: '默认分组',
      apiLink: '',
      Channel: 'selfhost',
      saveApi: false,
      selectedRows: [],
      /** 跨刷新保留勾选（id 一律转 string） */
      selectedIdSet: {},
      ignoreSelectionChange: false,
      chromeVer: '',
      tableKey: 0,
      list: null,
      listLoading: true,
      batchBusy: false,
      tableHeight: 480,
      listQuery: {
        page: 1,
        limit: 20,
        title: undefined,
        group: ''
      },
      dialogFormVisible: false,
      formSubmitLoading: false,
      dialogVisible: false,
      dialogStatus: '',
      dialogCookieFormatVisible: false,
      batchForm: {
        numberOfEnvironments: 1,
        proxyType: '默认',
        proxyAPI: ''
      },
      textMap: {
        update: this.$t('browser.edit'),
        create: this.$t('browser.add')
      },
      form: {
        proxy: {},
        cookie: {},
        homepage: {},
        ua: {},
        'ua-full-version': {},
        'sec-ch-ua': {},
        'ua-language': {},
        'time-zone': {},
        location: {},
        screen: {},
        fonts: {},
        canvas: {},
        'webgl-img': {},
        webgl: {},
        'audio-context': {},
        media: {},
        'client-rects': {},
        speech_voices: {},
        ssl: {},
        cpu: {},
        memory: {},
        'device-name': {},
        mac: {},
        dnt: {},
        'port-scan': {},
        gpu: {},
        webrtc: {}
      },
      rules: {
        // name: [{ required: true, message: this.$t('browser.required'), trigger: 'change' }],
        'proxy.value': [
          {
            required: true,
            message: this.$t('browser.required'),
            trigger: 'change'
          }
        ],
        'proxy.host': [
          {
            required: true,
            message: this.$t('browser.required'),
            trigger: 'change'
          }
        ],
        'cookie.jsonStr': [{ validator: validateCookie, trigger: 'blur' }]
      },
      downloadLoading: false,
      platforms: FINGERPRINT_PLATFORMS,
      WebGLVendors: Array.from(
        new Set(
          WebGLRenders.map(item => {
            const match = item.match(/\((.+?),/)
            if (match && match[1]) {
              return `Google Inc. (${match[1]})`
            }
          })
        )
      ),
      WebGLRenders: WebGLRenders,
      resolutionList: [
        '800 x 600',
        '1024 x 768',
        '1280 x 720',
        '1280 x 800',
        '1280 x 960',
        '1280 x 1024',
        '1360 x 768',
        '1400 x 900',
        '1400 x 1050',
        '1600 x 900',
        '1600 x 1200',
        '1920 x 1080',
        '1920 x 1200',
        '2048 x 1152',
        '2304 x 1440',
        '2560 x 1440',
        '2560 x 1600',
        '2880 x 1800',
        '5120 x 2880'
      ],
      TimeZones,
      Languages,
      SSL,
      Versions: coreVersions,
      cookieFormat: `[{
        "name": "cookie1",
        "value": "1",
        "domain": ".xxx.com",
        "path": "/",
        "session": false,
        "httpOnly": false,
        "secure": false,
        "sameSite": "Lax"
      }, {
        "name": "cookie2",
        "value": "2",
        "domain": ".xxx.com",
        "path": "/",
        "session": false,
        "httpOnly": false,
        "secure": false,
        "sameSite": "Lax"
      }]`,
      copied: false,
      checkProxyState: {
        checking: false
      },
      GroupList: [],
      crxOptions: []
    }
  },
  computed: {
    language() {
      return this.$store.getters.language
    },
    pagedList() {
      const list = this.list || []
      const page = this.listQuery.page || 1
      const limit = this.listQuery.limit || 20
      const start = (page - 1) * limit
      return list.slice(start, start + limit)
    }
  },
  watch: {
    'listQuery.page'() {
      this.$nextTick(() => this.restoreTableSelection())
    },
    'listQuery.limit'() {
      this.$nextTick(() => this.restoreTableSelection())
    },
    'form.proxy.host': function (newVal, oldVal) {
      const parts = newVal.split(':')
      if (parts.length === 4) {
        this.form.proxy.host = parts[0]
        this.form.proxy.port = parts[1]
        this.form.proxy.user = parts[2]
        this.form.proxy.pass = parts[3]
      } else if (parts.length === 2) {
        this.form.proxy.host = parts[0]
        this.form.proxy.port = parts[1]
        this.form.proxy.user = ''
        this.form.proxy.pass = ''
      }
    },
    'form.screen._value'(val) {
      const wh = val.split('x')
      this.form.screen.width = parseInt(wh[0])
      this.form.screen.height = parseInt(wh[1])
    },
    'form.chrome_version'(val) {
      if (val === '默认') {
        val = chromiumCoreVer
        this.form.ua.mode = 0
      } else {
        this.form.ua.mode = 1
      }
      this.form['sec-ch-ua'].value.forEach(item => {
        if (item.brand === 'Chromium') {
          item.version = val
        }
      })

      const curVers = Versions.filter(item => Number(item.split('.')[0]) === val)
      chromeVer = curVers[random.int(0, curVers.length - 1)]
      this.form.ua.value = genUserAgent(currentOs, chromeVer)
      this.form['ua-full-version'].value = getUaFullVersion(uaFullVersions, chromeVer)
    },
    'form.os'(val) {
      currentOs = val || 'Win 11'
      this.form.ua.value = genUserAgent(currentOs, chromeVer)

      let vers = Array.from(new Set(Versions.map(item => Number(item.split('.')[0]))))
      if (val === 'Win 7' || val === 'Win 8') {
        vers = vers.filter(item => item <= 109)
      }
      vers.unshift('默认')
      this.Versions = vers
      if (!vers.includes(this.form.chrome_version)) {
        this.form.chrome_version = vers[0]
      }
    },
    'form.webgl.vendor': {
      handler(val) {
        if (!val) return
        const vendor = val.match(/\((.+?)\)/)[1]
        this.WebGLRenders = WebGLRenders.filter(item => item.match(/\((.+?),/)[1] === vendor)
        if (!this.WebGLRenders.includes(this.form.webgl.render)) {
          this.form.webgl.render =
            this.WebGLRenders.length > 0
              ? this.WebGLRenders[random.int(0, this.WebGLRenders.length - 1)]
              : ''
        }
      },
      immediate: true,
      deep: true
    }
  },
  beforeCreate() {
    this._launchingIds = new Set()
    window._updateState = runingIds => {
      const ids = Array.isArray(runingIds) ? runingIds.map(String) : []
      // 原地改行状态，禁止 this.list = ... 换新数组，否则 el-table 会清空多选
      ;(this.list || []).forEach(item => {
        const id = String(item.id)
        const running = ids.includes(id)
        if (item.isRunning !== running) {
          this.$set(item, 'isRunning', running)
        }
        if (running) {
          if (item.runLoading) {
            this.$set(item, 'runLoading', false)
          }
          this._launchingIds.delete(id)
        } else if (!this._launchingIds.has(id)) {
          if (item.runLoading) {
            this.$set(item, 'runLoading', false)
          }
          if (item.debuggingPort != null) {
            this.$set(item, 'debuggingPort', null)
          }
        }
      })
    }
  },
  async created() {
    await this.getList()

    this.$watch(
      () => this.form['ua-language'].language,
      val => {
        this.form['ua-language'].value = [val, val.split('-')[0]].join(',')
        this.form['time-zone'].locale = val
      }
    )
    const store = await getGlobalData()
    const storedApiLink = store.apiLink
    if (storedApiLink) {
      this.apiLink = storedApiLink
      this.Channel = store.Channel || 'selfhost'
    } else {
      this.Channel = store.Channel || 'selfhost'
      this.apiLink = await getDefaultIpGeoApiLink()
    }

    if (this.apiLink) {
      const res = await fetch(this.apiLink)
        .then(req => req.json())
        .catch(console.warn)

      if (res) {
        IPGeo = res
      }
    }

    fontList = getFontList()

    const ver = await chromeSend('getBrowserVersion').catch(err => {
      console.warn(err)
      return '1.116.0.0'
    })

    window._callback = data => {
      if (sessionStorage.getItem('check_update_showed') === '1') {
        return
      }
      if (compareVersions(ver, data.ver) >= 0) {
        return
      }

      sessionStorage.setItem('check_update_showed', 1)
      const update = data.update.map(item => `<li>${item}</li>`).join('')
      this.$alert(
        `<div>版本：<b>${data.ver}</b></div>
         <div class="update">更新：<ol>${update}</ol></div>`,
        '发现新版本',
        {
          dangerouslyUseHTMLString: true,
          showCancelButton: true,
          confirmButtonText: '更新'
        }
      )
        .then(() => {
          window.open(data.url)
        })
        .catch(() => {})
    }
    loadScript(
      `http://api.virtualbrowser.cc/update/check_update.js?c=${
        (this.list || []).length
      }&v=${ver}&t=${Date.now()}`
    )
  },
  async mounted() {
    this.checkApiLinkSet()
    this.updateTableHeight()
    window.addEventListener('resize', this.updateTableHeight)
    this.GroupList = await getGroupList()
    this.GroupList.unshift({
      id: 0,
      name: this.$t('group.default')
    })
    this._unsubBrowserExited = onBrowserExited(payload => {
      const id = String((payload && payload.envId) || '')
      if (id && this.list) {
        const row = this.list.find(r => String(r.id) === id)
        if (row) {
          row.isRunning = false
          row.runLoading = false
          row.debuggingPort = null
        }
      }
      updateRuningState().catch(() => {})
    })
    this._runStateTimer = setInterval(() => {
      updateRuningState().catch(() => {})
    }, 3000)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.updateTableHeight)
    if (this._runStateTimer) {
      clearInterval(this._runStateTimer)
      this._runStateTimer = null
    }
    if (typeof this._unsubBrowserExited === 'function') {
      this._unsubBrowserExited()
      this._unsubBrowserExited = null
    }
  },
  methods: {
    updateTableHeight() {
      // navbar ~52 + tags ~34 + toolbar ~56 + pagination ~56 + padding ~62
      const h = window.innerHeight - 260
      this.tableHeight = Math.max(280, h)
    },
    isRowBusy(row) {
      if (!row) return false
      return !!(row.deleteLoading || row.groupLoading || row.runLoading || this.batchBusy)
    },
    applyListFilters(fullList) {
      let next = Array.isArray(fullList) ? fullList.slice() : []
      const group = this.listQuery.group
      if (group) {
        next = next.filter(item => item.group === group)
      }
      const title = this.listQuery.title != null ? String(this.listQuery.title).trim() : ''
      if (title) {
        const q = title.toLowerCase()
        next = next.filter(item => {
          const itemName = String(item.name == null ? '' : item.name).toLowerCase()
          const itemId = String(item.id == null ? '' : item.id)
          const itemIdLower = itemId.toLowerCase()
          return (
            itemId === title || itemIdLower === q || itemName.includes(q) || itemIdLower.includes(q)
          )
        })
      }
      const limit = this.listQuery.limit || 20
      const maxPage = Math.max(1, Math.ceil((next.length || 0) / limit) || 1)
      if (this.listQuery.page > maxPage) {
        this.listQuery.page = maxPage
      }
      return next
    },
    async refreshList() {
      await this.getList()
    },
    async getList() {
      this.ignoreSelectionChange = true
      this.listLoading = true
      try {
        const fullList = await getBrowserList()
        this.GlobalData = await getGlobalData()
        this.apiLink = this.GlobalData.apiLink || ''
        this.Channel = this.GlobalData.Channel || 'selfhost'
        // processUpdateData needs full working set; apply after mutate
        this.list = fullList
        await this.processUpdateData()
        this.list = this.applyListFilters(this.list)
        await updateRuningState()
        this.loadSyncStatuses()
      } catch (err) {
        console.error('[browser] getList failed:', err)
        this.list = this.list || []
        this.$message.error((err && err.message) || '加载浏览器列表失败')
      } finally {
        this.listLoading = false
        this.$nextTick(() => {
          this.restoreTableSelection()
        })
      }
    },
    async loadSyncStatuses() {
      await Promise.all(
        this.list.map(async row => {
          this.$set(row, 'syncLoading', true)
          try {
            const status = await getProfileSyncStatus(String(row.id))
            this.$set(row, 'syncStatus', status)
          } catch (err) {
            this.$set(row, 'syncStatus', {
              status: 'error',
              cloudError: err.message || String(err)
            })
          } finally {
            this.$set(row, 'syncLoading', false)
          }
        })
      )
    },
    syncStatusTagType(status) {
      const map = {
        synced: 'success',
        'cloud-newer': 'warning',
        'local-newer': 'warning',
        'local-only': 'info',
        'cloud-only': 'info',
        'no-cloud': 'info',
        'no-auth': 'info',
        error: 'danger'
      }
      return map[status] || 'info'
    },
    syncStatusLabel(status) {
      const key = status || 'unknown'
      const label = this.$t('browser.cloudSyncStatus.' + key)
      if (label && label.indexOf('browser.cloudSyncStatus') === -1) {
        return label
      }
      return this.$t('browser.cloudSyncStatus.unknown')
    },
    formatSyncVersion(syncStatus) {
      if (!syncStatus) return ''
      const local = syncStatus.localVersion != null ? syncStatus.localVersion : '—'
      const cloud = syncStatus.cloudVersion != null ? syncStatus.cloudVersion : '—'
      return this.$t('browser.cloudSyncVersion', { local, cloud })
    },
    formatProxyLabel(row) {
      if (!row.proxy || row.proxy.mode === 0) return '默认'
      if (row.proxy.mode === 1) return '不使用代理'
      const hostPort =
        row.proxy.host && row.proxy.port ? ` ${row.proxy.host}:${row.proxy.port}` : ''
      return `${row.proxy.protocol || ''}${hostPort}`.trim() || '—'
    },
    async handleSyncCommand(command, row) {
      if (row.isRunning) {
        this.$message.warning(this.$t('browser.cloudSyncRunningBlock'))
        return
      }
      const envId = String(row.id)
      this.$set(row, 'syncActionLoading', true)
      try {
        if (command === 'upload') {
          await syncProfileToCloud(envId)
          this.$message.success(this.$t('browser.cloudSyncSuccess'))
        } else if (command === 'pull') {
          await syncProfileFromCloud(envId)
          this.$message.success(this.$t('browser.cloudSyncSuccess'))
        }
        const status = await getProfileSyncStatus(envId)
        this.$set(row, 'syncStatus', status)
      } catch (err) {
        const raw = err && err.message ? err.message : String(err)
        const msg =
          raw === 'timeout' || err === 'timeout' ? this.$t('browser.cloudSyncTimeout') : raw
        this.$message.error(msg)
      } finally {
        this.$set(row, 'syncActionLoading', false)
      }
    },
    handleFilter() {
      this.listQuery.page = 1
      this.searchList()
    },
    getRowKey(row) {
      return row == null ? '' : String(row.id)
    },
    handleSelect() {
      // selection-change 已统一维护 selectedIdSet
    },
    handleSelectAll() {
      // selection-change 已统一维护 selectedIdSet
    },
    handleSelectionChange(selection) {
      if (this.ignoreSelectionChange) return
      // 刷新/loading/批量时 el-table 会先抛出空 selection，不能据此清空勾选
      if ((this.listLoading || this.batchBusy) && (!selection || selection.length === 0)) {
        return
      }
      const pageIds = new Set((this.pagedList || []).map(r => String(r.id)))
      // 先清掉当前页旧勾选，再写入本次 selection（避免翻页/刷新丢其它页勾选）
      Object.keys(this.selectedIdSet).forEach(id => {
        if (pageIds.has(id)) {
          this.$delete(this.selectedIdSet, id)
        }
      })
      ;(selection || []).forEach(row => {
        this.$set(this.selectedIdSet, String(row.id), true)
      })
      this.syncSelectedRowsFromList()
    },
    syncSelectedRowsFromList() {
      const ids = this.selectedIdSet
      const full = this.list || []
      this.selectedRows = full.filter(row => ids[String(row.id)])
    },
    restoreTableSelection() {
      const table = this.$refs.browserTable
      if (!table || typeof table.clearSelection !== 'function') {
        this.ignoreSelectionChange = false
        return
      }
      this.ignoreSelectionChange = true
      try {
        table.clearSelection()
        ;(this.pagedList || []).forEach(row => {
          if (this.selectedIdSet[String(row.id)]) {
            table.toggleRowSelection(row, true)
          }
        })
        this.syncSelectedRowsFromList()
      } finally {
        this.$nextTick(() => {
          this.ignoreSelectionChange = false
        })
      }
    },
    clearTableSelection() {
      this.selectedIdSet = {}
      this.selectedRows = []
      const table = this.$refs.browserTable
      if (table && typeof table.clearSelection === 'function') {
        this.ignoreSelectionChange = true
        try {
          table.clearSelection()
        } finally {
          this.$nextTick(() => {
            this.ignoreSelectionChange = false
          })
        }
      }
    },
    handleBatchStart() {
      if (this.selectedRows.length === 0) {
        this.$notify({
          title: '错误提示',
          message: '至少需要勾选一个环境',
          type: 'warning',
          duration: 2000
        })
        return
      }
      for (let i = 0; i < this.selectedRows.length; i++) {
        const row = this.selectedRows[i]
        this.launchEnvironment(row, i * 2000)
      }
    },
    launchEnvironment(row, delay) {
      setTimeout(() => {
        this.handleLaunch(row)
      }, delay)
    },
    getDefaultForm() {
      const currentZone = this.getCurrentTimeZone()
      // const defaultLanguage = IPGeo.languages?.split(',')[0] || ''
      const cpuCore = getRandomCpuCore()
      const memorySize = getRandomMemorySize(cpuCore)

      return {
        id: undefined,
        name: '',
        group: this.$t('group.default'),
        os: 'Win 11',
        chrome_version: '默认',
        proxy: {
          mode: 0,
          value: '',
          protocol: 'HTTP',
          host: '',
          port: '',
          user: '',
          pass: '',
          API: ''
        },
        cookie: {
          mode: 0,
          value: '',
          jsonStr: ''
        },
        homepage: {
          mode: 1,
          value: 'https://store.jddj.com/'
        },
        ua: {
          mode: 1,
          value: genUserAgent(currentOs, chromeVer)
        },
        'ua-full-version': {
          mode: 1,
          value: getUaFullVersion(uaFullVersions, chromeVer)
        },
        'sec-ch-ua': {
          mode: 0,
          value: [
            { brand: 'Chromium', version: chromiumCoreVer },
            { brand: 'Not=A?Brand', version: '99' }
          ]
        },
        'ua-language': {
          mode: 2,
          language: IPGeo.languages?.split(',')[0] || '',
          value: IPGeo.languages
        },
        'time-zone': {
          mode: 2,
          zone: this.getZone(currentZone?.offset || 0),
          utc: currentZone?.utc[0] || '',
          locale: IPGeo.languages?.split(',')[0] || '',
          name: currentZone?.text || '',
          value: currentZone?.offset || 0
        },
        webrtc: {
          mode: 0
        },
        location: {
          mode: 2,
          enable: 1,
          longitude: IPGeo.longitude,
          latitude: IPGeo.latitude,
          precision: random.int(10, 5000)
        },
        screen: {
          mode: 0,
          width: screen.width,
          height: screen.height,
          _value: `${screen.width} x ${screen.height}`
        },
        fonts: {
          mode: 1,
          value: fontList.sort(() => Math.random() - 0.5).slice(0, random.int(1, 10))
        },
        canvas: {
          mode: 1,
          r: random.int(-10, 10),
          g: random.int(-10, 10),
          b: random.int(-10, 10),
          a: random.int(-10, 10)
        },
        'webgl-img': {
          mode: 1,
          r: random.int(-10, 10),
          g: random.int(-10, 10),
          b: random.int(-10, 10),
          a: random.int(-10, 10)
        },
        webgl: {
          mode: 1,
          vendor: this.WebGLVendors[random.int(0, this.WebGLVendors.length - 1)]
          // render: this.WebGLRenders[random.int(0, this.WebGLRenders.length - 1)],
        },
        'audio-context': {
          mode: 1,
          channel: random.float(0, 0.0000001),
          analyer: random.float(0, 0.1)
        },
        media: { mode: 1 },
        'client-rects': {
          mode: 1,
          width: random.float(-1, 1),
          height: random.float(-1, 1)
        },
        speech_voices: {
          mode: 1,
          value: genRandomSpeechVoices()
        },
        ssl: {
          mode: 0,
          value: []
        },
        cpu: { mode: 1, value: cpuCore },
        memory: { mode: 1, value: memorySize },
        'device-name': { mode: 1, value: genRandomComputerName() },
        mac: { mode: 1, value: genRandomMacAddr() },
        dnt: { mode: 1, value: 0 },
        'port-scan': { mode: 1, value: [] },
        gpu: { mode: 1, value: 1 },
        crxIds: []
      }
    },
    getCurrentTimeZone() {
      if (!this.cachedTimeZone) {
        const timezoneOffset = new Date().getTimezoneOffset() / -60
        this.cachedTimeZone = TimeZones.find(item => item.offset === timezoneOffset)
      }
      return this.cachedTimeZone
    },
    async loadCrxOptions() {
      try {
        this.crxOptions = await getLocalCrxList()
      } catch (err) {
        console.warn(err)
        this.crxOptions = []
      }
    },
    resetForm() {
      this.$nextTick(() => {
        this.form = this.getDefaultForm()
      })
    },
    RandomFingerprint() {
      const { id, name, timestamp, proxy } = this.form
      this.$nextTick(() => {
        this.form = {
          ...this.getDefaultForm(),
          id,
          name,
          timestamp,
          proxy: { ...proxy }
        }
      })
    },
    handleCreate() {
      this.resetForm()
      this.loadCrxOptions()
      this.dialogStatus = 'create'
      this.dialogFormVisible = true
      this.$nextTick(() => {
        this.$refs['dataForm'].clearValidate()
      })
    },
    onCreateData() {
      this.$refs['dataForm'].validate(async (valid, result) => {
        if (valid) {
          this.formSubmitLoading = true
          try {
            this.form.timestamp = Date.now()
            this.preProcessData(this.form)
            await addBrowser(this.form, this.$t('browser.browser'))
            await this.getList()
            this.dialogFormVisible = false
            this.$notify({
              title: this.$t('browser.success'),
              message: this.$t('browser.create') + this.$t('browser.success'),
              type: 'success',
              duration: 2000
            })
          } catch (err) {
            console.error('[createBrowser]', err)
            chromeSend('appendUiLog', {
              level: 'ERROR',
              message: 'createBrowser failed',
              meta: { error: err && err.message ? err.message : String(err) }
            }).catch(() => {})
            this.$message.error('创建失败: ' + (err && err.message ? err.message : String(err)))
          } finally {
            this.formSubmitLoading = false
          }
        } else {
          this.showValidationError(result)
        }
      })
    },
    async processUpdateData() {
      for (let i = 0; i < this.list.length; i++) {
        const item = this.list[i]
        if (this.processData(item)) {
          await updateBrowser(item)
        }
      }
    },
    processData(data) {
      let changed = false

      const proxy = data.proxy || { mode: 0, value: '' }
      const ua = data.ua || { mode: 0, value: '' }
      let chrome_version = data.chrome_version
      if (chrome_version == null || chrome_version === '') {
        chrome_version = '默认'
        data.chrome_version = chrome_version
        changed = true
      }
      if (typeof ua.value !== 'string') {
        ua.value = ua.value != null ? String(ua.value) : ''
        changed = true
      }
      data.proxy = proxy
      data.ua = ua
      if (!data['sec-ch-ua'] || typeof data['sec-ch-ua'] !== 'object') {
        data['sec-ch-ua'] = { mode: 0, value: [] }
      }
      if (proxy.mode === 2) {
        let oldProxy = proxy.value
        if (oldProxy && !proxy.host) {
          oldProxy = oldProxy.replace(/#.*/, '')
          let protocol
          if (oldProxy.includes('@socks')) {
            protocol = 'SOCKS5'
            oldProxy = 'http://' + oldProxy.replace('@socks', '')
          } else if (!oldProxy.includes('://')) {
            oldProxy = 'http://' + oldProxy
          }
          try {
            const proxyURL = new URL(oldProxy)
            proxy.protocol = protocol || proxyURL.protocol.replace(':', '').toUpperCase()
            proxy.host = proxyURL.hostname
            proxy.port = proxyURL.port
            proxy.user = proxyURL.username
            proxy.pass = proxyURL.password

            changed = true
          } catch (ex) {
            console.warn('Parse Proxy Error: ', ex)
          }

          // proxy.value = ''
        }
      }
      if (ua.mode === 1) {
        if (ua.value.includes("'")) {
          ua.value = ua.value.replace(/^'|'$/g, '')
          changed = true
        }
      }
      if (typeof data['sec-ch-ua'].value === 'string') {
        data['sec-ch-ua'].value = [
          { brand: 'Chromium', version: chromiumCoreVer },
          { brand: 'Not=A?Brand', version: '99' }
        ]
        changed = true
      }
      if (data['ua-full-version'] === undefined) {
        const chrome_version_num =
          chrome_version === '默认' ? chromiumCoreVer : Number(chrome_version) || chromiumCoreVer
        const chromeVer =
          Versions.find(item => Number(item.split('.')[0]) === chrome_version_num) ||
          `${chrome_version_num}.0.0.0`
        data['ua-full-version'] = {
          mode: 1,
          value: getUaFullVersion(uaFullVersions, chromeVer)
        }
        changed = true
      }

      return changed
    },
    preProcessData(data) {
      if (!data || typeof data !== 'object') return
      const proxy = data.proxy
      if (proxy && Number(proxy.mode) === 2) {
        const protocol = String(proxy.protocol || 'HTTP').toLowerCase()
        let url = protocol + '://'
        if (proxy.user) {
          url += proxy.user + ':' + (proxy.pass || '') + '@'
        }
        url += proxy.host || ''
        if (proxy.port) {
          url += ':' + proxy.port
        }
        proxy.url = url
      }

      // Cookie 表单绑 jsonStr，落盘用 value：mode=1 时解析写入数组
      if (data.cookie) {
        if (Number(data.cookie.mode) === 1) {
          const raw =
            data.cookie.jsonStr != null && String(data.cookie.jsonStr).trim() !== ''
              ? data.cookie.jsonStr
              : typeof data.cookie.value === 'string'
              ? data.cookie.value
              : null
          if (raw != null && typeof raw === 'string' && String(raw).trim() !== '') {
            try {
              // eslint-disable-next-line no-eval
              const json = eval(`(${raw})`)
              if (Array.isArray(json)) {
                const normalized = normalizeCookieList(json)
                data.cookie.value = normalized
                data.cookie.jsonStr = JSON.stringify(normalized, null, 2)
              }
            } catch (err) {
              if (!Array.isArray(data.cookie.value)) {
                console.warn('[preProcessData] cookie jsonStr parse failed', err)
              } else {
                data.cookie.value = normalizeCookieList(data.cookie.value)
              }
            }
          } else if (Array.isArray(data.cookie.value)) {
            data.cookie.value = normalizeCookieList(data.cookie.value)
          }
        }
        // mode!==1：不清空已有 Cookie，避免编辑再存抹掉导入数据；运行时仍仅 mode=1 注入
      }

      if (!data['sec-ch-ua'] || typeof data['sec-ch-ua'] !== 'object') {
        data['sec-ch-ua'] = { mode: 0, value: [] }
      }
      if (!Array.isArray(data['sec-ch-ua'].value)) {
        data['sec-ch-ua'].value = []
      }
      data['sec-ch-ua'].value = data['sec-ch-ua'].value.filter(item => {
        return item && item.brand && item.version
      })
    },
    showValidationError(result) {
      try {
        const first = Object.values(result || {})[0]
        const msg =
          first && first[0]
            ? (this.$t('browser.' + first[0].field) || '') + (first[0].message || '')
            : this.$t('browser.required')
        this.$message.error(msg || '表单校验失败')
      } catch (e) {
        this.$message.error(this.$t('browser.required') || '表单校验失败')
      }
    },
    parseCookieArray(raw) {
      if (Array.isArray(raw)) return raw
      if (raw == null || raw === '') return null
      if (typeof raw === 'string') {
        const text = raw.trim()
        if (!text) return null
        try {
          const parsed = JSON.parse(text)
          return Array.isArray(parsed) ? parsed : null
        } catch {
          try {
            // eslint-disable-next-line no-eval
            const parsed = eval(`(${text})`)
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        }
      }
      return null
    },
    normalizeImportItem(raw) {
      const defaults = this.getDefaultForm()
      const src = raw && typeof raw === 'object' ? raw : {}
      const item = { ...defaults, ...src }

      for (const key of Object.keys(defaults)) {
        const defVal = defaults[key]
        const srcVal = src[key]
        if (
          defVal &&
          typeof defVal === 'object' &&
          !Array.isArray(defVal) &&
          srcVal &&
          typeof srcVal === 'object' &&
          !Array.isArray(srcVal)
        ) {
          item[key] = { ...defVal, ...srcVal }
        }
      }

      if (!item.cookie || typeof item.cookie !== 'object') {
        item.cookie = { mode: 0, value: '', jsonStr: '' }
      }

      let cookies = null
      if (Array.isArray(src.cookieData) && src.cookieData.length) {
        cookies = src.cookieData
      } else if (Array.isArray(item.cookie.value) && item.cookie.value.length) {
        cookies = item.cookie.value
      } else {
        cookies =
          this.parseCookieArray(item.cookie.jsonStr) || this.parseCookieArray(item.cookie.value)
      }

      if (cookies && cookies.length) {
        item.cookie.mode = 1
        item.cookie.value = normalizeCookieList(cookies)
        item.cookie.jsonStr = JSON.stringify(item.cookie.value, null, 2)
      }

      // 产品无消费方，避免污染展示
      if ('launchArgs' in item) {
        delete item.launchArgs
      }

      this.preProcessData(item)
      return item
    },
    handleUpdate(row) {
      this.resetForm()
      this.loadCrxOptions()
      this.dialogStatus = 'update'
      this.dialogFormVisible = true
      this.$nextTick(() => {
        this.form = Object.assign(this.form, row) // copy obj
        currentOs = this.form.os || 'Win 11'
        this.form.crxIds = (row.crxIds || []).map(String)
        // 编辑回填：落盘 cookie.value → 表单 cookie.jsonStr
        if (!this.form.cookie || typeof this.form.cookie !== 'object') {
          this.form.cookie = { mode: 0, value: '', jsonStr: '' }
        }
        const cookie = this.form.cookie
        if (cookie.value != null && cookie.value !== '') {
          if (typeof cookie.value === 'object') {
            cookie.jsonStr = JSON.stringify(cookie.value, null, 2)
          } else if (typeof cookie.value === 'string') {
            cookie.jsonStr = cookie.value
          }
        } else if (cookie.jsonStr == null) {
          cookie.jsonStr = ''
        }
        this.form.timestamp = new Date(this.form.timestamp)
        this.$refs['dataForm'].clearValidate()
      })
    },
    onUpdateData() {
      this.$refs['dataForm'].validate(async (valid, result) => {
        if (valid) {
          this.formSubmitLoading = true
          try {
            const tempData = Object.assign({}, this.form)
            console.log('submit', tempData)
            tempData.timestamp = +new Date(tempData.timestamp)
            this.preProcessData(tempData)
            await updateBrowser(tempData)
            await this.getList()
            this.dialogFormVisible = false
            this.$notify({
              title: this.$t('browser.success'),
              message: this.$t('browser.update') + this.$t('browser.success'),
              type: 'success',
              duration: 2000
            })
          } catch (err) {
            console.error('[updateBrowser]', err)
            chromeSend('appendUiLog', {
              level: 'ERROR',
              message: 'updateBrowser failed',
              meta: { error: err && err.message ? err.message : String(err) }
            }).catch(() => {})
            this.$message.error('更新失败: ' + (err && err.message ? err.message : String(err)))
          } finally {
            this.formSubmitLoading = false
          }
        } else {
          this.showValidationError(result)
        }
      })
    },
    handleDelete(row, index) {
      this.$confirm(this.$t('browser.delete_confirm').replace('${name}', row.name))
        .then(async () => {
          this.$set(row, 'deleteLoading', true)
          try {
            await deleteBrowser(row.id)
            this.$delete(this.selectedIdSet, String(row.id))
            this.syncSelectedRowsFromList()
            await this.refreshList()
            this.$notify({
              title: this.$t('browser.success'),
              message: this.$t('browser.delete') + this.$t('browser.success'),
              type: 'success',
              duration: 2000
            })
          } catch (err) {
            console.error('[deleteBrowser]', err)
            this.$message.error('删除失败: ' + (err && err.message ? err.message : String(err)))
          } finally {
            this.$set(row, 'deleteLoading', false)
          }
        })
        .catch(() => {})
    },
    async handleLaunch(row) {
      if (this.isRowBusy(row) && !row.runLoading) return
      if (row.proxy && row.proxy.API) {
        const ok = await this.GetAPIProxy(row)
        if (!ok) {
          this.$message.error('获取 API 代理失败，已中止启动')
          return
        }
      }
      const id = String(row.id)
      this._launchingIds.add(id)
      this.$set(row, 'runLoading', true)
      // spawn 很快；站点云拉取已从启动路径移除，60s 足够
      try {
        const ret = await chromeSendTimeout('launchBrowser', 60000, id)
        this.$set(row, 'runLoading', false)
        this.$set(row, 'isRunning', true)
        if (ret && ret.debuggingPort) {
          this.$set(row, 'debuggingPort', ret.debuggingPort)
        }
        this._launchingIds.delete(id)
        await updateRuningState()
      } catch (err) {
        console.warn('[launchBrowser]', err)
        const raw = err && err.message ? err.message : String(err)
        const tip =
          raw === 'timeout' || err === 'timeout'
            ? '启动超时。若刚点过云同步请稍候再试；站点数据请用「云同步」拉取，勿依赖启动自动下载。'
            : raw
        this.$message.error('启动失败: ' + tip)
        chromeSend('appendUiLog', {
          level: 'ERROR',
          message: 'launchBrowser failed',
          meta: { envId: id, error: tip }
        }).catch(() => {})
        this.$set(row, 'runLoading', false)
        this.$set(row, 'isRunning', false)
        this.$set(row, 'debuggingPort', null)
        this._launchingIds.delete(id)
      }
    },
    async handleOpenDebug(row) {
      const id = String(row.id)
      this.$set(row, 'debugLoading', true)
      try {
        let info = await chromeSendTimeout('getEnvDebugInfo', 8000, id).catch(() => null)
        if (!info || !info.url) {
          const port =
            (info && info.port) ||
            row.debuggingPort ||
            (await chromeSend('getEnvDebugPort', id).catch(() => null))
          if (!port) {
            throw new Error('环境未运行或无调试端口')
          }
          info = { port, url: `http://127.0.0.1:${port}/json/list` }
        }
        this.$set(row, 'debuggingPort', info.port)
        if (window.vbDesktop && typeof window.vbDesktop.openExternal === 'function') {
          await window.vbDesktop.openExternal(info.url)
        } else {
          window.open(info.url, '_blank')
        }
        this.$message.success('已打开调试端口 ' + info.port)
      } catch (err) {
        console.error('[openDebug]', err)
        this.$message.error('打开调试失败: ' + (err && err.message ? err.message : String(err)))
      } finally {
        this.$set(row, 'debugLoading', false)
      }
    },
    onReRandomComputerName() {
      this.form['device-name'].value = genRandomComputerName()
    },
    onReRandomAddr() {
      this.form.mac.value = genRandomMacAddr()
    },
    getZone(offset) {
      const sign = offset > 0 ? '+' : '-'
      const hours = Math.floor(Math.abs(offset))
      const decimal = Math.abs(offset) - hours
      const minutes = Math.round(decimal * 60)
      const paddedMinutes = minutes < 10 ? '0' + minutes : minutes.toString()
      return `UTC${sign}${hours}:${paddedMinutes}`
    },
    onCopy() {
      this.copied = true
      clearTimeout(tooltipTimer)
      tooltipTimer = setTimeout(() => {
        this.copied = false
      }, 3000)
    },
    onImport({ raw: file }) {
      const reader = new FileReader()
      reader.onload = async e => {
        const jsonStr = e.target.result

        let json
        try {
          json = JSON.parse(jsonStr)
          if (!Array.isArray(json)) {
            throw new Error('导入文件必须是环境数组 JSON')
          }
          const groupNames = json
            .map(item => (item && item.group != null ? String(item.group).trim() : ''))
            .filter(Boolean)
          await this.ensureGroupsExist(groupNames)
          for (let i = 0; i < json.length; i++) {
            const item = this.normalizeImportItem(json[i])
            await addBrowser(item)
          }

          await this.reloadGroupList()
          await this.getList()
          this.$notify({
            title: this.$t('browser.success'),
            message: `导入${json.length}条数据`,
            type: 'success',
            duration: 3000
          })
        } catch (ex) {
          console.error('[onImport]', ex)
          chromeSend('appendUiLog', {
            level: 'ERROR',
            message: 'onImport failed',
            meta: { error: ex && ex.message ? ex.message : String(ex) }
          }).catch(() => {})
          this.$notify({
            title: '导入失败',
            message: `${ex.message}`,
            type: 'error',
            duration: 3000
          })
        }
      }
      reader.readAsText(file)
    },
    async reloadGroupList() {
      const list = await getGroupList()
      this.GroupList = [{ id: 0, name: this.$t('group.default') }, ...list]
    },
    async ensureGroupsExist(names) {
      const defaultName = this.$t('group.default')
      const existing = new Set(
        (this.GroupList || [])
          .map(g => (g && g.name != null ? String(g.name).trim() : ''))
          .filter(Boolean)
      )
      existing.add(defaultName)
      const unique = [...new Set((names || []).map(n => String(n || '').trim()).filter(Boolean))]
      for (const name of unique) {
        if (existing.has(name)) continue
        await addGroup({ name, timestamp: Date.now() }, name)
        existing.add(name)
      }
    },
    onExport() {
      if (this.selectedRows.length === 0) {
        this.$notify({
          title: '错误提示',
          message: '至少需要勾选一个环境',
          type: 'warning',
          duration: 2000
        })
        return
      }
      var currentDate = new Date().toISOString().replace(/[-:]/g, '')
      var fileName = 'Virtual-Browser_' + currentDate + '.json'
      var blob = new Blob([JSON.stringify(this.selectedRows, null, 2)], {
        type: 'application/json;charset=utf-8'
      })
      saveAs(blob, fileName)
    },
    async checkProxy() {
      this.checkProxyState.checking = true
      this.preProcessData(this.form)
      let timeout = false
      const ret = await chromeSendTimeout('checkProxy', 10 * 1000, this.form.proxy.url).catch(
        err => {
          timeout = err === 'timeout'
        }
      )
      this.$alert(
        `<p>代理：${this.form.proxy.url}</p>
        <p style="color:${ret ? '#67C23A' : '#F56C6C'}">检测${
          ret ? '成功' : timeout ? '超时' : '失败'
        }</p>`,
        '代理检测',
        {
          type: ret ? 'success' : 'error',
          dangerouslyUseHTMLString: true
        }
      )
      this.checkProxyState.checking = false
    },
    setAPI(data) {
      this.$set(this.form.proxy, 'API', data)
    },
    async fetchAndParseAPI(apiData) {
      const response = await fetch(apiData)
      if (!response.ok) {
        this.$notify({
          title: '错误提示',
          message: '响应错误，请检查API接口有效性',
          type: 'warning',
          duration: 2000
        })
        throw new Error(`网络响应不是 ok，状态码为：${response.status}`)
      }

      let data
      const clonedResponse = response.clone()
      try {
        data = await response.json()
      } catch (jsonError) {
        const text = await clonedResponse.text()
        const parts = text.split(':')
        switch (parts.length) {
          case 4:
            data = { user: parts[0] || '', pass: parts[1] || '', ip: parts[2], port: parts[3] }
            break
          case 2:
            data = { ip: parts[0], port: parts[1] }
            break
          default:
            this.$notify({
              title: '错误提示',
              message:
                '响应格式既不是有效的JSON格式也不是有效的[ip:端口]或[用户名:密码:IP:端口]格式',
              type: 'warning',
              duration: 2000
            })
            throw new Error(
              '响应格式既不是有效的 JSON 也不是有效的 ip:port 或 用户名:密码:IP:端口 格式'
            )
        }
      }

      if (!data || !data.ip || !data.port) {
        this.$notify({
          title: '错误提示',
          message: '响应不包含ip或端口',
          type: 'warning',
          duration: 2000
        })
        throw new Error('API 响应不包含 ip 或 port')
      }

      return data
    },

    updateProxyData(proxyData, data) {
      proxyData.host = data.ip
      proxyData.port = data.port
      proxyData.user = data.user || ''
      proxyData.pass = data.pass || ''
    },

    async checkAPIProxy() {
      try {
        const data = await this.fetchAndParseAPI(this.form.proxy.API)
        this.updateProxyData(this.form.proxy, data)
        this.onUpdateData()
      } catch (error) {
        console.error('请求代理 API 失败:', error)
        return
      }
      this.checkProxy()
    },
    async GetAPIProxy(row) {
      try {
        const data = await this.fetchAndParseAPI(row.proxy.API)
        this.updateProxyData(row.proxy, data)
        await this.onUpdateRowData(row)
        return true
      } catch (error) {
        console.error('请求代理 API 失败:', error)
        this.$message.error(
          '请求代理 API 失败: ' + (error && error.message ? error.message : String(error))
        )
        return false
      }
    },
    async onUpdateRowData(row) {
      if (!row || typeof row !== 'object') {
        console.error('The provided row is undefined or not an object.')
        throw new Error('invalid row')
      }

      row.timestamp = +new Date()
      this.preProcessData(row)
      await updateBrowser(row)
      await this.refreshList()
      this.dialogFormVisible = false
      this.$notify({
        title: this.$t('browser.success'),
        message: this.$t('browser.update') + this.$t('browser.success'),
        type: 'success',
        duration: 2000
      })
    },
    onAddBrand() {
      this.form['sec-ch-ua'].value.push({ brand: '', version: '' })
    },
    onRemoveBrand(brand) {
      this.form['sec-ch-ua'].value = this.form['sec-ch-ua'].value.filter(item => {
        return item.brand !== brand
      })
    },
    async handleBatchCreate() {
      const count = Number(this.batchForm.numberOfEnvironments)
      if (!count || count < 1) {
        this.$message.error('无效的环境数量')
        return
      }
      this.batchBusy = true
      try {
        const items = []
        for (let i = 0; i < count; i++) {
          const newEnvironmentData = this.getDefaultForm()
          newEnvironmentData.timestamp = Date.now()
          const uaData = this.updateChromeVer(newEnvironmentData.chrome_version)
          newEnvironmentData.ua.value = uaData.ua
          newEnvironmentData['ua-full-version'].value = uaData.uaFullVersion

          if (this.batchForm.proxyAPI) {
            newEnvironmentData.proxy.API = this.batchForm.proxyAPI
            newEnvironmentData.proxy.protocol = this.batchForm.proxyType
            newEnvironmentData.proxy.mode = 2
          }
          if (this.batchForm.proxyType === '默认') {
            newEnvironmentData.proxy.mode = 0
          }
          if (this.batchForm.proxyType === '不使用代理') {
            newEnvironmentData.proxy.mode = 1
          }
          this.preProcessData(newEnvironmentData)
          items.push(newEnvironmentData)
        }
        await batchAddBrowsers(items, this.$t('browser.browser'))
        this.batchForm.numberOfEnvironments = 1
        this.batchForm.proxyType = '默认'
        this.batchForm.proxyAPI = ''
        await this.refreshList()
        this.dialogVisible = false
        this.$notify({
          title: this.$t('browser.success'),
          message: `批量创建 ${items.length} 条` + this.$t('browser.success'),
          type: 'success',
          duration: 2000
        })
      } catch (error) {
        this.$message.error(
          '批量创建失败: ' + (error && error.message ? error.message : String(error))
        )
      } finally {
        this.batchBusy = false
      }
    },
    updateChromeVer(val) {
      if (val === '默认') {
        val = chromiumCoreVer
      }
      const curVers = Versions.filter(item => Number(item.split('.')[0]) === val)
      this.chromeVer = curVers[random.int(0, curVers.length - 1)]
      const UaValue = genUserAgent(currentOs, this.chromeVer)
      const UaFullVersion = getUaFullVersion(uaFullVersions, this.chromeVer)
      return {
        ua: UaValue,
        uaFullVersion: UaFullVersion
      }
    },
    async handleBatchDelete() {
      if (this.selectedRows.length === 0) {
        this.$notify({
          title: '错误提示',
          message: '至少需要勾选一个环境',
          type: 'warning',
          duration: 2000
        })
        return
      }

      this.$confirm(
        this.$t('browser.delete_confirm').replace(
          '${name}',
          this.selectedRows.map(row => row.name).join(', ')
        )
      )
        .then(async () => {
          this.batchBusy = true
          const rows = this.selectedRows.slice()
          rows.forEach(row => this.$set(row, 'deleteLoading', true))
          try {
            const result = await batchDeleteBrowsers(rows.map(row => row.id))
            ;(result.deleted || []).forEach(id => {
              this.$delete(this.selectedIdSet, String(id))
            })
            this.syncSelectedRowsFromList()
            await this.refreshList()
            const deleted = (result && result.deleted && result.deleted.length) || 0
            const failed = (result && result.failed && result.failed.length) || 0
            if (failed > 0) {
              this.$notify({
                title: '部分失败',
                message: `删除成功 ${deleted} 条，失败 ${failed} 条`,
                type: 'warning',
                duration: 3000
              })
            } else {
              this.$notify({
                title: this.$t('browser.success'),
                message: `${deleted} ` + this.$t('browser.delete') + this.$t('browser.success'),
                type: 'success',
                duration: 2000
              })
            }
          } catch (error) {
            console.error('Error during batch delete:', error)
            this.$message.error(
              '批量删除失败: ' + (error && error.message ? error.message : String(error))
            )
          } finally {
            rows.forEach(row => this.$set(row, 'deleteLoading', false))
            this.batchBusy = false
          }
        })
        .catch(() => {})
    },
    async showSettingsDialog() {
      const store = await getGlobalData()
      this.Channel = store.Channel || 'selfhost'
      this.apiLink = store.apiLink || (await getDefaultIpGeoApiLink())
      this.showSetDialog = true
    },
    async saveSettings() {
      const GlobalData = await getGlobalData()
      const channel = this.Channel || 'selfhost'
      let link = (this.apiLink || '').trim()

      // 自建：未填 URL 时自动落到 cloudApiBase + /api/ip-geo
      if (channel === 'selfhost' && !link) {
        link = await getDefaultIpGeoApiLink()
        this.apiLink = link
      }

      // selfhost：不做第三方域名校验，允许任意自建 /api/ip-geo URL
      if (channel === 'virtualbrowser' && !link.includes('virtualbrowser')) {
        this.$notify({
          title: '错误',
          message: '请输入正确的渠道API链接',
          type: 'error',
          duration: 2000
        })
        return
      } else if (channel === 'ipgeolocation' && !link.includes('ipgeolocation')) {
        this.$notify({
          title: '错误',
          message: '请输入正确的渠道API链接',
          type: 'error',
          duration: 2000
        })
        return
      }

      if (!link) {
        this.$notify({
          title: '错误',
          message: '请填写 IP 查询 API 完整 URL',
          type: 'error',
          duration: 2000
        })
        return
      }

      this.Channel = channel
      this.apiLink = link

      if (link !== GlobalData.apiLink) {
        await setGlobalData('apiLink', link)
      }
      if (channel !== GlobalData.Channel) {
        await setGlobalData('Channel', channel)
      }

      this.$notify({
        title: '保存成功',
        message:
          'IP 查询 API 已写入本机 User Data/global.dat（与云端登录地址无关）。启动默认主页时会自动注入到指纹窗口。',
        type: 'success',
        duration: 4000
      })
      this.showSetDialog = false
    },
    async checkApiLinkSet() {
      const store = await getGlobalData()
      // native 侧会在缺省时写入自建默认；此处再兜底一次，避免强制弹窗
      let link = (store.apiLink || '').trim()
      const channel = store.Channel || 'selfhost'
      if (!link) {
        link = await getDefaultIpGeoApiLink()
        await setGlobalData('apiLink', link)
        if (!store.Channel) {
          await setGlobalData('Channel', 'selfhost')
        }
      }
      this.apiLink = link
      this.Channel = channel
      // 已能自动推导自建 URL，不再强制弹设置窗
    },
    async searchList() {
      this.ignoreSelectionChange = true
      try {
        const fullList = await getBrowserList()
        this.list = this.applyListFilters(fullList)
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        this.$nextTick(() => this.restoreTableSelection())
      }
    },
    handleBatchSetGroup() {
      if (this.selectedRows.length === 0) {
        this.$notify({
          title: '错误提示',
          message: '至少需要勾选一个环境',
          type: 'warning',
          duration: 2000
        })
        return
      }
      this.selectedGroup = this.$t('group.default')
      this.currentEditingRow = null
      this.dialogBatchSetGroupVisible = true
    },
    async applyBatchSetGroup() {
      if (!this.selectedGroup) {
        this.$notify({
          title: '操作失败',
          message: '请先选择一个分组',
          type: 'warning',
          duration: 2000
        })
        return
      }

      this.batchBusy = true
      try {
        if (this.currentEditingRow) {
          this.$set(this.currentEditingRow, 'groupLoading', true)
          this.currentEditingRow.group = this.selectedGroup
          await updateBrowser(this.currentEditingRow)
          this.$set(this.currentEditingRow, 'groupLoading', false)
        } else {
          const rows = this.selectedRows.slice()
          rows.forEach(row => this.$set(row, 'groupLoading', true))
          try {
            await batchSetBrowserGroup(
              rows.map(row => row.id),
              this.selectedGroup
            )
          } finally {
            rows.forEach(row => this.$set(row, 'groupLoading', false))
          }
        }

        this.$notify({
          title: '操作成功',
          message: '分组更新成功',
          type: 'success',
          duration: 2000
        })
        this.dialogBatchSetGroupVisible = false
        await this.refreshList()
      } catch (err) {
        this.$message.error('分组更新失败: ' + (err && err.message ? err.message : String(err)))
      } finally {
        this.batchBusy = false
      }
    },
    async handleEditGroup(row) {
      this.selectedGroup = row.group || this.$t('group.default')
      this.currentEditingRow = row
      this.dialogBatchSetGroupVisible = true
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/element-variables.scss';

.app-container {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 100px);
}

.browser-table {
  width: 100%;
  flex: 1 1 auto;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;

  .toolbar-primary,
  .toolbar-filters,
  .toolbar-secondary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .toolbar-filters {
    flex: 1 1 auto;
    min-width: 280px;
  }

  .toolbar-secondary {
    margin-left: auto;
  }

  .toolbar-select {
    width: 150px;
  }

  .toolbar-input {
    width: 200px;
  }
}

.browser-table {
  width: 100%;
}

.proxy-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.sync-loading {
  min-height: 28px;
}

.sync-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.sync-status-block {
  cursor: default;
}

.sync-dropdown {
  margin-top: 2px;
}

.action-delete {
  color: #f56c6c !important;
  padding: 0 4px;

  &:hover {
    color: #f78989 !important;
  }
}

.flex {
  display: flex;
  align-items: center;
}

.formDlg {
  ::v-deep {
    .el-dialog {
      min-width: 400px;
    }
    .tips {
      font-size: 12px;
      color: #999;
      line-height: 1.5;
      margin-top: 5px;
    }
    .el-dialog__body {
      padding-top: 5px;
      padding-bottom: 0;
    }
    .el-timeline {
      padding: 0;

      .el-timeline-item {
        padding-bottom: 5px;
      }
      .el-timeline-item__tail {
        border-color: $--color-primary;
      }
      .el-timeline-item__node {
        background-color: $--color-primary;
      }

      .el-timeline-item__content {
        h3 {
          color: $--color-primary;
          margin: 0;
          font-size: 1em;
        }
      }
    }
    .el-form-item {
      margin-bottom: 15px;
      margin-right: 5px;
    }
    .el-form-item__label {
      font-size: 12px;
      word-break: keep-all;
    }
    .custom-sec-ua {
      margin-top: 5px;

      .item {
        display: flex;
        align-items: flex-start;
      }
    }
  }

  .drawer-content {
    height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;

    .form-wrap {
      overflow-y: auto;
      padding: 10px 20px;
    }
    .dialog-footer {
      padding: 20px;
      text-align: center;

      ::v-deep {
        .el-button {
          width: 150px;
        }
      }
    }
  }
}

.dialog-cookie {
  ::v-deep {
    .el-dialog__body {
      padding: 10px 20px;
    }
  }
}

.sync-version-hint {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
  line-height: 1.3;
}

.sync-tooltip {
  line-height: 1.5;
  max-width: 240px;
}

.sync-scope-hint {
  margin-top: 2px;
  font-size: 11px;
  color: #c0c4cc;
  line-height: 1.35;
  white-space: normal;
  max-width: 220px;
}

.qq-group {
  margin-left: -15px;
  p {
    margin-top: -5px;
    margin-left: 18px;
    font-size: 13px;
  }
  code {
    padding: 0.2em 0.4em;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    font-size: 120%;
    white-space: break-spaces;
    background-color: rgba(175, 184, 193, 0.2);
    border-radius: 6px;
  }
}
</style>
