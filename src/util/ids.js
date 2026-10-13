'use strict';

const safeId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

module.exports = { safeId };
