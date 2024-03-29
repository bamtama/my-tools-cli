const { readFileSync, writeFileSync, appendFileSync } = require('fs')
const { resolve } = require('path')

const CONFIG_FILE_PATH = '.my-tools-cli.json'

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

const writeIgnoreAuth = () => {
  const file = readFile('.gitignore')
  if (file) {
    // 如果文件未添加到gitignore中，自动写入一下
    if (!file.match(CONFIG_FILE_PATH)) {
      appendFile('.gitignore', `\r# my-tools-cli\r${CONFIG_FILE_PATH}\r`)
    }
  } else {
    console.warn('没有找到忽略文件')
  }
}

const writeFile = (filepath, filecontent) => {
  writeFileSync(resolve(process.cwd(), filepath), filecontent, { encoding: 'utf8' })
}

const appendFile = (filepath, filecontent) => {
  appendFileSync(resolve(process.cwd(), filepath), filecontent, { encoding: 'utf8' })
}

/**
 * 获取配置项
 * @param {String} key 配置项标记
 * @param {Object} defaultValues 默认数据
 * @returns 
 */
const getConfig = (key, defaultValues) => {
  const fileCfg = readFile(CONFIG_FILE_PATH)
  const file = parseJson(fileCfg) || {}
  const cfg = file[key]
  if (!cfg) {
    const jsondata = {
      ...file,
      [key]: defaultValues
    }
    writeFile(CONFIG_FILE_PATH, JSON.stringify(jsondata, null, '\t'))
    writeIgnoreAuth()
    return jsondata[key]
  } else {
    return cfg
  }
}
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = []; // 用于存放所有的promise实例
  const executing = []; // 用于存放目前正在执行的promise
  for (const item of array) {
    const p = Promise.resolve(iteratorFn(item)); // 防止回调函数返回的不是promise，使用Promise.resolve进行包裹
    ret.push(p);
    if (poolLimit <= array.length) {
      // then回调中，当这个promise状态变为fulfilled后，将其从正在执行的promise列表executing中删除
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        // 一旦正在执行的promise列表数量等于限制数，就使用Promise.race等待某一个promise状态发生变更，
        // 状态变更后，就会执行上面then的回调，将该promise从executing中删除，
        // 然后再进入到下一次for循环，生成新的promise进行补充
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}
module.exports = {
  readFile,
  parseJson,
  writeFile,
  appendFile,
  getConfig,
  asyncPool
}