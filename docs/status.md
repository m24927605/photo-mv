# 照片MV：交付與實測結果

更新：2026-10-16，版本 0.1.0。依使用者指示先驗證 macOS；Windows CI 已通過 MSI 安裝、啟動與解除安裝，完整編輯功能及 Windows 10／11 實機仍待驗。

## 本輪完成

- 文字框內容與邊框都能直接按住拖曳，不需拖曳符號。單擊選取框，雙擊或按 Enter 編輯，4px 內抖動不移動文字；邊框游標為四向移動。
- 拖曳有跟隨框中心的十字線、中央／三等分參考格、水平及垂直吸附線，可對齊其他文字。Alt 暫停吸附，Esc 取消本次拖曳；參考線不進入輸出。
- 已重現並修正移出原文字框放開後未提交位置的問題。移動／放開由整個視窗處理，不依賴原框持續收到事件。
- 拖曳快取照片與其他文字，每畫面只更新活動文字；移動事件不再反覆縮放原圖或讀取版面。
- 文字框的 × 與拖曳符號已移除。工具列為「上一步」「下一步」「刪除」，前後步驟只影響文字時間區塊、隨專案保存。刪除最後文字仍可退回；退回後的新文字編輯清除文字下一步。
- 未選取文字只顯示內容；點文字顯示外框及工具列，點預覽區空白收起。顏色在挑選及反白時即時顯示，點影片關閉色盤仍保留。
- 移除「未選音樂」；音樂 × 在音樂區塊右上角，有音樂才顯示。
- 「預覽」按鈕改成「播放」，新增「回到開始」：停止聲音及播放，回到綠色開始軸。尚在啟動的音訊請求也會取消，避免返回後被舊請求重新播放。

## 實際驗證

環境：macOS 26.6.2／Apple Silicon arm64、Node 25.9.0、Electron 44.7.2、隨附 FFmpeg 6.0。Windows 編碼器為 6.1.1。

| 驗證 | 本輪結果 |
| --- | --- |
| `npm test` | 29／29 通過；模型、對齊、文字前後步驟、文件驗證、真正編碼、原子儲存及 SIGKILL 恢復 |
| `test/desktop-full.cjs` | 17 組完整功能通過，核對本次新產生的時間戳；[完整紀錄](test-results/macos-functional.json) |
| `test/text-drag.cjs` | 直接拖文字、框外放開提交、中心及其他文字吸附、十字線、取消、單擊輸入、上一步／下一步、保存重載、工具列刪除最後文字；[紀錄](test-results/text-drag.json) |
| 原生 computer-use | 真正滑鼠全選文字、拖出原框放開，位置保留；實際按上一步回原位、下一步回新位置；[修正前](test-results/native-text-drag-before.json)、[修正後](test-results/native-text-drag.json)、[畫面](test-results/native-text-drag.png) |
| `test/editor-layout.cjs` | 三種視窗尺寸、文字控制項隱藏／再顯示、邊框游標、px 字級、工具列刪除／前後步驟、音樂區塊內的 × 真正滑鼠點擊 |
| `test/text-color.cjs` | 全選反白色彩、即時挑色、點影片關色盤、復原、重載與實際無損影片精確色彩；[紀錄](test-results/text-color.json) |
| `test/transport.cjs` | 播放標籤、空專案停用、回到 0 秒／開始軸、播放及音訊啟動中返回、停止聲音、位置保存 |
| 時間軸與專案 | photo-selection、timeline-scrub、timeline-crop、playback-header、projects 全部通過 |

17 組完整功能包含 JPEG／PNG／WebP、特殊檔名、排序／時間／刪除、文字內容及樣式、WAV／MP3／M4A、音樂裁切／循環／音量／淡化、真正播放、五種 MP4 及五種無損 MOV、EXIF／透明度、取消與壞檔拒絕、來源 SHA-256 保護、輸出取消後重試及自動儲存。五種 MOV 均解碼 RGB 與合成 PNG 比較，像素完全相同。

功能測試使用真正 Electron、Canvas、HTML Audio、IPC 與 FFmpeg；自動替代檔案對話框選擇結果。原生拖曳另在獨立測試專案用 computer-use 操作，沒有修改使用者專案。

## 拖曳負擔比較

相同高解析照片、20 段文字、120 次連續移動事件：修正前原圖重畫 120 次、版面讀取 4920 次，事件處理約 71.1ms；修正後這兩項均為 0，合併成 1 次畫面更新，事件處理約 0.7ms、該次繪製約 1.1ms。[基準](test-results/text-drag-baseline.json)、[修正後](test-results/text-drag.json)。這是本機測得的程式處理時間，不宣稱所有機器皆固定 60fps。

## Windows 交付

安裝檔：`dist/照片MV-0.1.0-Windows-x64-Setup.msi`。本輪已重新封裝並核對，最新封裝核對結果以 [套件紀錄](test-results/windows-package.json) 為準。內含 Windows 編碼器與授權，不需額外安裝 Node 或 FFmpeg。靜態核對包括完整 src、AMD64、編碼器、內嵌圖示及產品名稱；不能代替 Windows 執行測試。

## 限制與未驗證

- Windows 10／11 使用者實機、完整互動編輯功能與系統字體仍待測；CI 安裝與啟動已另行通過。
- 未做 300 張、4 小時、極大像素、磁碟滿、斷電及完整輔助閱讀器驗收。
- 自動儲存約 250ms 內尚未落盤的瞬間操作仍可能在異常終止後遺失；來源照片與音樂須留在原路徑，專案不封裝媒體。
- 剪裁產生的本機 PCM 未自動清除，長片磁碟用量仍待測。
- 安裝包未簽章；RGB 無損 MOV 的播放器相容性有限。簽章不列入本輪功能完成條件。
- 音訊已實際播放與驗證非靜音，沒有宣稱人工主觀音質驗收。
- 上次依賴檢查正式依賴 0 項、開發工具鏈有 8 項 moderate 回報；本輪未重查線上 audit。

## 另存專案

已加入專案選單與 Ctrl/Cmd+Shift+S。project 測試通過建立副本、後續儲存新檔、取消、同檔／別名／素材覆寫拒絕及原檔保留。另以 computer-use 操作真正儲存與另存視窗，確認原檔維持 3 秒、副本修改後為 5 秒，原檔 SHA-256 不變：[紀錄](test-results/native-save-as.json)。自動儲存目前仍保存本機恢復快照，具名檔案由使用者儲存更新。

## 跨照片文字延續（本輪已實作）

文字從新增時間延續到後續照片；中途修改建立新區塊，前段保持原樣，後段接續新設定直到同一段文字的下一次明確修改。內容、位置及樣式均適用，刪除建立空白區塊。刻度上的「字」可回到區塊開始。區塊附著照片相對時間，隨照片排序；超出縮短後照片長度的區塊暫不顯示。文字上一步／下一步改為全時間軸文字專用快照，舊照片別操作歷史不沿用，既有文字及素材保留。

- 模型等單元測試 29／29 通過。
- 真正 Electron：三張延續、中途改字、刪除／上一步、具名專案重開、自動儲存重載及播放；完整 90 影格與共同剪裁影片的代表 RGB 影格精確比對：[紀錄](test-results/text-inheritance.json)。
- 原生 computer-use：第二張帶入 A、直接修改 B、第三張為 B、回第一張仍為 A：[紀錄](test-results/native-text-inheritance.json)。使用獨立專案。
- 拖曳、鍵盤刪除、顏色、版面、共同剪裁、專案儲存／另存均重新通過；17 組完整功能重新執行並核對本次時間戳。

## 文字鍵盤刪除

已加入文字框選取狀態的 Delete／Backspace，與工具列刪除共用流程。單擊選框、雙擊或 Enter 編輯；新增仍可直接輸入。text-keyboard、photo-selection、editor-layout、text-drag、text-color 已通過。另以 computer-use 實際單擊選框並按 Mac 刪除鍵，框被移除且照片保留；上一步恢復後雙擊、Cmd+A、刪除，僅清空字元，框保留：[完整原生步驟](test-results/native-text-keyboard-steps.json)、[自動測試](test-results/text-keyboard.json)。

本輪文字延續修改後已重新執行完整 17 組影片矩陣；Windows 套件內容以套件紀錄為準；MSI 安裝／啟動結果另見下方 Windows MSI 驗證。

## 後段既有文字區塊覆蓋新增文字的修正

根因是後段整組文字快照覆蓋前段新加入的獨立文字。新增文字已使用獨立識別，同步它的變更至後段，遇到同一文字的明確修改才停止；其他文字區塊保持。新增兩項模型回歸，總計 29 項通過。Electron 實測先建立後段 B，再在前段新增 C，後面同時呈現 B+C；具名重開及完整／剪裁無損輸出 RGB 比對通過。另以原生滑鼠按第二張、+文字、輸入「貓哥午安」、切第三張，確認原有後段文字與新文字同時存在，回第一張沒有多出新字。證據為 text-inheritance.json 與 native-text-inheritance.json。

## Windows MSI 建置

Windows 交付格式改為 MSI，GitHub Actions 在 Windows runner 執行 npm test、建置、套件核對及安裝／啟動／解除安裝。完整 Windows 編輯功能仍須另行驗收，不以安裝成功代替。

Windows MSI 驗證已通過：[CI run 38861828780](https://github.com/m24927605/photo-mv/actions/runs/38861828780)。Windows Server 2025 x64 runner 的 30 項測試全數通過，MSI 已實際安裝、核對所有安裝檔案 SHA-256、開啟編輯視窗及解除安裝。安裝程式內含程式、編碼器及授權。這不是完整 Windows 互動功能驗收；證據見 `test-results/windows-package.json` 與 `test-results/windows-msi.json`。
