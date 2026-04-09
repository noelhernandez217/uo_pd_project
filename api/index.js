require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') })
const { app, init } = require('../backend/app')

const initPromise = init()

module.exports = async (req, res) => {
  await initPromise
  return app(req, res)
}
