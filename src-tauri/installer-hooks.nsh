; NSIS 安装器钩子：卸载时清除本地存储数据（Tauri Store / WebView 缓存）
!macro NSIS_HOOK_POSTUNINSTALL
  ; %APPDATA%\com.windchime.notewidget —— Tauri Store 的 widget-config.json
  RMDir /r "$APPDATA\com.windchime.notewidget"
  ; %LOCALAPPDATA%\com.windchime.notewidget —— WebView2 用户数据目录
  RMDir /r "$LOCALAPPDATA\com.windchime.notewidget"
  ; 开机自启注册项（autostart 插件写入）
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WindChimeNote"
!macroend
