'use strict';
const fs = require('fs');
const path = require('path');
const { safeId } = require('../util/ids');

const VERSION = 1;

function createCache(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (id) => path.join(dir, `${safeId(id)}.json`);
  return {
    get(id, mtimeMs) {
      try {
        const d = JSON.parse(fs.readFileSync(file(id), 'utf8'));
        return d.version === VERSION && d.mtimeMs === mtimeMs ? d.analysis : null;
      } catch {
        return null;
      }
    },
    put(id, mtimeMs, analysis) {
      const f = file(id);
      fs.writeFileSync(`${f}.tmp`, JSON.stringify({ version: VERSION, mtimeMs, analysis }));
      fs.renameSync(`${f}.tmp`, f);
    },
  };
}

module.exports = { createCache };
