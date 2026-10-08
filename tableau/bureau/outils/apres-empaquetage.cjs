// electron-builder afterPack hook: electronDist (package.json) reuses the Electron already downloaded by
// npm (no 2nd download into %LOCALAPPDATA%\electron on C:), but its demo app comes along: removed here,
// before the installer is made.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function apresEmpaquetage(contexte) {
  fs.rmSync(path.join(contexte.appOutDir, 'resources', 'default_app.asar'), { force: true });
};
