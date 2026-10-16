require('../src/media-protocol.cjs');
// Native dialogs remain intact; only their initial test folder is supplied.
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fixtures = path.join(__dirname, 'fixtures');
const evidence = path.join(__dirname, '..', 'docs', 'test-results');
const tone = path.join(fixtures, 'tone.wav');
if (!fs.existsSync(tone)) execFileSync(require('ffmpeg-static'), ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', tone]);
const events = [];
const record = event => { events.push(event); fs.writeFileSync(path.join(evidence, 'native-dialog-events.json'), JSON.stringify({ platform: process.platform, events }, null, 2)); };
const open = dialog.showOpenDialog.bind(dialog), save = dialog.showSaveDialog.bind(dialog);
dialog.showOpenDialog = async (win, options) => {
  const result = await open(win, { ...options, defaultPath: fixtures });
  record({ operation: 'native-open', kinds: options.filters[0].extensions, canceled: result.canceled, files: result.filePaths.map(file => path.basename(file)) });
  return result;
};
dialog.showSaveDialog = async (win, options) => {
  const result = await save(win, { ...options, defaultPath: path.join(evidence, 'native-paint.mp4') });
  record({ operation: 'native-save', canceled: result.canceled, filename: path.basename(result.filePath || '') });
  return result;
};
const dataDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'celebration-native-state-'));app.setPath('userData',dataDir);
app.commandLine.appendSwitch('force-renderer-accessibility');
require('../src/main.cjs');
