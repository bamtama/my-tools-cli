#!/usr/bin/env node

const inquirer = require('inquirer')
const utils = require('./utils')
const ftpCore = require('./ftpCore.js')
const { program } = require('commander')

const CONFIG_FILE_PATH = '.my-tools-cli.json'

const DEFAULT_CFG = {
  // remotePath: '/开发环境/Website/',
  remoteDefaultDir: '',
  localDir: 'dist',
  uploadExcludes: [
    'config.js',
    'nf9OG1BChTRzn4WhlH.js',
    '**.zip'
  ], // 忽略上传的文件
  delExcludes: [
    'config.js',
    'nf9OG1BChTRzn4WhlH.js'
  ]  // 忽略删除的文件
}

/**
 * 读取用户信息
 */
const getAuth = async () => {
  return utils.getConfig('deployAuth')
}

// const writeIgnoreAuth = data => {
//   const file = utils.readFile('.gitignore')
//   if (file) {
//     utils.writeFile(CONFIG_FILE_PATH, JSON.stringify(data, null, '\t'))
//     // 如果文件未添加到gitignore中，自动写入一下
//     if (!file.match(CONFIG_FILE_PATH)) {
//       utils.appendFile('.gitignore', `\r# my-tools-cli\r${CONFIG_FILE_PATH}\r`)
//     }
//     return data.deployAuth
//   } else {
//     console.warn('没有找到忽略文件')
//     return {}
//   }
// }

const createAuth = async () => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'host'
    },
    {
      type: 'input',
      name: 'user'
    },
    {
      type: 'input',
      name: 'password'
    }
  ]).then(ans => {
    // return writeIgnoreAuth({deployAuth: ans})
    return utils.getConfig('deployAuth', ans)
  })
}

/**
 * 读取配置项
 */
const getConfig = async () => {
  const fileCfg = utils.readFile(CONFIG_FILE_PATH)
  const cfg = utils.parseJson(fileCfg)?.deploy
  if (!cfg) {
    // 如果没读到，写入默认配置
    return inquirer.prompt([
      {
        type: 'input',
        name: 'dir',
        message: '请输入部署默认目录名'
      }
    ]).then(ans => {
      const defaultCfg = {
        ...DEFAULT_CFG,
        remoteDefaultDir: ans.dir
      }
      return utils.getConfig('deploy', defaultCfg)
    })
  } else {
    return cfg
  }
}

/**
 * 
 */
const start = async () => {
  // 读取用户信息
  const auth = await getAuth() || await createAuth()
  // 读取配置项
  const cfg = await getConfig()
  // 创建使用的配置项
  const useCfg = {
    remotePath: '/开发环境/Website/',
    ...cfg
  }
  // 读取命令行参数，更新目标远程目录
  program.option('-cdir, --customDir <char>')
  program.parse()
  const { customDir } = program.opts()
  if (customDir) {
    useCfg.remoteDefaultDir = customDir
  }
  ftpCore.init(auth, useCfg)
}

module.exports = {
  start
}