# VirtualBrowser NSIS installer
# Invoked by packaging/scripts/build-client.ps1 with /D defines

!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.1.0"
!endif

!ifndef STAGING_DIR
  !define STAGING_DIR "..\staging"
!endif

!define PRODUCT_NAME "VirtualBrowser"
!define PRODUCT_PUBLISHER "VirtualBrowser"
!define INSTALL_DIR "$LOCALAPPDATA\Programs\VirtualBrowser"
!define USER_DATA_DIR "$LOCALAPPDATA\VirtualBrowser"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VirtualBrowser"

Name "${PRODUCT_NAME}"
OutFile "..\output\VirtualBrowser-Setup-${PRODUCT_VERSION}.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel user
ShowInstDetails show

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Launch VirtualBrowser"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  File /r "${STAGING_DIR}\*.*"

  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\VirtualBrowser.exe"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\VirtualBrowser.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Function LaunchApp
  Exec '"$INSTDIR\VirtualBrowser.exe"'
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"

  ; Keep user data dir per ACCEPTANCE S7 (do not delete USER_DATA_DIR)
SectionEnd