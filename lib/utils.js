const { readFileSync, writeFileSync, appendFileSync } = require('fs')
const { resolve } = require('path')

const CONFIG_FILE_PATH = '.my-tools-cli-config.json'

const readFile = filepath => {
  try {
    const package = readFileSync(resolve(process.cwd(), filepath), 'utf8')
    return package
  } catch (err) {
    console.warn('未找到文件', filepath)
    return null
  }
}
const parseJson = data => {
  try {
    return JSON.parse(data)
  } catch (err) {
    console.warn('转换为json失败', data)
    return null
  }
}

const writeFile = (filepath, filecontent) => {
  writeFileSync(resolve(process.cwd(), filepath), filecontent, { encoding: 'utf8' })
}

const appendFile = (filepath, filecontent) => {
  appendFileSync(resolve(process.cwd(), filepath), filecontent, { encoding: 'utf8' })
}

const getConfig = (key, defaultValues) => {
  const fileCfg = readFile(CONFIG_FILE_PATH)
  const file = parseJson(fileCfg) || {}
  const cfg = file[key]
  if (!cfg) {
    const jsondata = {
      ...file,
      [key]: defaultValues
    }
    appendFile(CONFIG_FILE_PATH, JSON.stringify(jsondata, null, '\t'))
    return jsondata[key]
  } else {
    return cfg
  }
}

module.exports = {
  readFile,
  parseJson,
  writeFile,
  appendFile,
  getConfig
}