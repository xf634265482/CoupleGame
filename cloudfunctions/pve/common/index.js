const constants = require('./constants');
const id = require('./id');
const db = require('./db');

module.exports = {
  ...constants,
  ...id,
  ...db,
};
