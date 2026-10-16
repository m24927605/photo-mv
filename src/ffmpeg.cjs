const path = require('node:path');
module.exports = process.versions.electron && require('electron').app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
  : require('ffmpeg-static');
