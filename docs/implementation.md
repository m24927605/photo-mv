# 實作文件

## 工作界線

新專案無既有呼叫端、資料或相容性需求。變更範圍為 package 設定、Electron main/preload、純前端編輯器、共享模型／繪圖、輸出服務、單元與實際編碼測試、使用說明。無舊格式遷移或相容層。

## 分層與交付順序

1. 固定需求與五種輸出尺寸，建立可驗證文件（本組文件）。
2. 建立模型、文字快照復原及驗證；以最小 fixture 測順序、時間、文字、錯誤輸入。
3. 建立桌面殼、原生匯入，完成一張圖片到實際影片的垂直路徑。
4. 疊加多張順序、時間、音樂、文字樣式與拖曳、復原、播放預覽。
5. 實測五種解析度與音軌；核對無損輸出影格與來源合成 PNG。
6. 依 release gate 記錄證據，再決定是否允許發版。

## 模組責任

- `src/model.js`：輸出尺寸、狀態驗證、不可變編輯、文字時間區塊解析與文字專用前後步驟與音樂設定驗證。
- `src/text-alignment.js`：純文字框幾何與水平／垂直吸附。
- `src/draw.js`：完整容納原圖、黑底、多行文字，相對座標轉像素。
- `src/renderer.js`：畫面內純文字編輯、浮動工具列、文字拖曳／刪除／復原、時間軸與序列合成。
- `src/timeline.js`：共用刻度、照片拖曳排序、左右邊緣調整時間與播放位置。
- `src/project-store.cjs`：本機快照合併寫入、sync 與原子替換；可指定命名專案檔名。
- `src/project-document.cjs`：專案格式、狀態與資產路徑驗證。
- `src/projects.cjs`：新建／開啟／儲存、原生選單與快捷鍵、未儲存保護、檔名與視窗標題。
- `src/audio.cjs`：來源與輸出聲波生成、共用音樂裁切與淡化濾鏡；共用範圍剪裁的 PCM 音樂生成。
- `src/ffmpeg.cjs`：開發及封裝編碼器路徑。
- `src/music-editor.js`：單首音樂裁切、音量、淡入淡出與按需展開的控制介面。
- `scripts/prepare-windows.cjs`：準備 Windows 編碼器與授權檔。
- `src/media-protocol.cjs`：啟動前註冊媒體協定，已匯入音樂白名單、Range 串流及錯誤範圍拒絕。
- `src/preload.cjs`：方法級 IPC bridge，無通用 invoke。
- `src/main.cjs`：匯入資產白名單、原生視窗／對話框、輸出生命週期。
- `src/export.cjs`：暫存 PNG 與 concat 清單、FFmpeg 啟動、進度及取消、成功提交。

匯入只回傳 ID／名稱／唯讀內容；路徑留在主程序。所有 async 失敗顯示清楚訊息並解除 busy。自動儲存包含文字輸入草稿、文字復原、資產路徑及 UI 位置；主程序驗證快照後寫入 userData/current-project.json。正常關窗透過 renderer flush 完成後退出；重開先讀取狀態再啟用編輯。

輸出階段：選目的地 → 建立 job → 依照片及文字區塊邊界合成 PNG → 編碼 → 提交／清理。取消需結束 encoder 並清理暫存；同時只能有一個 job。

## 執行與環境

開發需要 Node 22 以上及 npm；Electron、electron-builder、ffmpeg-static 皆由 lockfile 固定版本。`npm ci`、`npm start`、`npm test`、`npm run test:functional`。測試另需要 PATH 中的 ffprobe 檢查實際輸出。

`npm run build:win` 下載固定版本的 Windows x64 FFmpeg 與其 LICENSE／README，然後建立 MSI 安裝包。Windows 安裝後不需 Node、npm、FFmpeg 或開發環境。程式以 resources/ffmpeg/ffmpeg.exe 的絕對路徑啟動編碼器，不依賴 Windows PATH。輸出位於 dist/照片MV-0.1.0-Windows-x64-Setup.msi。安裝包目前未簽章；簽章不列入這次功能完成條件。

## 有界工作策略

每片工作最多 90 分鐘，最多兩輪完整驗收。語意修改完成後才固定證據；失敗先按根因修復，執行針對性測試，再做完整驗證。時間或外部能力不足時更新 `docs/status.md`，記錄可執行狀態、命令、失敗項及精確阻礙。未完成項不得標記通過。正式封存／簽章不在語意反覆修改時執行。

共用剪裁由模型計算照片交集，main 驗證資產、產生本機媒體後回傳輸出快照，renderer 以此輸出，不修改編輯專案。中間媒體位於 userData/media。音樂透過資產 ID 白名單的 celebration-asset 協定以 Range 串流播放，避免把長 PCM 轉為巨大 base64。產生的 PCM 在本機保留，目前不自動回收未引用的產生檔；不影響來源檔。

開始／結束軸即專案 selection；Model.playbackRange 為預覽使用的範圍。播放保留原時間軸上的音訊相位與淡化，結束軸處停止。匯出時透過既有 crop IPC 建立範圍快照，避免為每次拖曳產生音樂檔。

專案操作先提交文字草稿、停止播放並完成自動儲存，再透過專用 IPC 執行。來源資產在文件驗證通過後一次替換；清除舊縮圖並以專案序號隔離尚未完成的非同步影像載入。命名儲存採用既有原子儲存服務，禁止覆寫匯入來源或其硬連結。自動恢復文件另保存命名檔案路徑／dirty 標記，與手動儲存分開。

`Model.totalDuration` 僅計算照片時間；`playbackRange` 限定開始／結束軸有效範圍。文字大小輸入以輸出高度換算 px，Canvas 與 DOM 仍使用同一相對字級。

拖曳開始時計算文字框尺寸及參考點，將照片及其他文字合成到一次性背景 Canvas；移動只記錄最新座標，requestAnimationFrame 每畫面複製背景並繪製活動文字，以 transform 移動編輯框，避免移動事件重縮原圖、重新量測及讀取版面。window 接收 pointermove／pointerup，不依賴原文字框持續接收到放開事件；取消時清理 RAF 及暫存 transform。

文字由 Model.textBlocks／textsAt 統一解析：照片開頭非空 texts 或 textOverride 為明確區塊，未標記空陣列則延續；textChanges 保存照片內相對時間與完整文字陣列。預覽在照片或文字區塊邊界更新，renderSegments 依兩種邊界切分輸出；裁切先物化起點文字，再重算區塊時間。歷史改存全時間軸文字專用快照 textUndo／textRedo，只套回現存照片文字，不復原排序、長度或音樂；草稿保留時間點，新編輯清除下一步。舊的照片別 undo／redo 已移除，先前操作歷史不沿用。播放啟動以請求序號取消過期的非同步音訊來源／play 請求，停止與返回先遞增序號。

`node scripts/verify-windows.cjs` 核對 src 全檔、Windows 程式及編碼器 AMD64、編碼器雜湊、應用程式七尺寸圖示、產品名稱、MSI 檔頭與安裝檔 SHA-256，寫入 Windows 套件證據。此靜態檢查不代表 Windows 執行驗收。MSI 的安裝、啟動與解除安裝另由 Windows runner 執行 scripts/test-windows-msi.ps1，完整編輯功能仍須獨立驗證。

專案另存沿用儲存流程，saveAs 布林值經 preload 傳遞並在 main 驗證。建立副本前核對原專案／目的檔的路徑及 inode，寫入成功後才切換目前檔案；既有素材覆寫保護及原子寫入共用。

新增文字使用獨立 UUID。changeText 將該文字的新增、內容、位置、樣式與刪除同步到後續區塊，直到遇到同一文字已明確改動或刪除的區塊；後段其他文字的變化不會阻斷它。既有區塊仍保存完整合成狀態，預覽、儲存、裁切與匯出使用同一結果；每個區塊驗證 ID 唯一及 20 段上限，超量失敗不提交編輯。
