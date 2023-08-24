#!/usr/bin/env node
const inquirer = require('inquirer')
const utils = require('./utils')
const semver = require('semver')
const sh = require('shelljs')

const DEFAULT_CFG = {
  match: "version: \\'(.*?)\\'",
  inFile: "src/utils/constant.js",
  outFile: "src/utils/constant.js"
}

function getCustomVersion (cfg) {
  if (cfg.inFile) {
    // 读取infile文件
    const infile_data = utils.readFile(cfg.inFile)
    const version = infile_data.match(new RegExp(cfg.match))[1]
    return version
  } else {
    return null
  }
}
function writePackage (filedata, new_version) {
  const newdata = filedata.replace(/\"version\": \"(.*?)\"/, `"version": "${new_version}"`)
  utils.writeFile('package.json', newdata)
}
function writeCustomOutFile (cfg, new_version) {
  const old_filedata = utils.readFile(cfg.outFile)
  const newdata = old_filedata.replace(new RegExp(cfg.match), `version: '${new_version}'`)
  utils.writeFile(cfg.outFile, newdata)
}

async function genChangelog (custom_config) {
  // require('./conventional-changelog-cli')
  const curCmd = custom_config?.changelog || `conventional-changelog -p angular -i CHANGELOG.md -s`
  sh.exec(curCmd)
}
function doGit (ans, custom_config) {
  // 提交package.json / outFiles / CHANGLOG.md
  const { commit, tag, push, pushtag, new_version } = ans
  const msg = `"chore(release): ${new_version}"`
  if (commit) {
    sh.exec(`git add package.json CHANGELOG.md`)
    const outfile = custom_config?.outFile
    outfile && sh.exec(`git add ${outfile}`)
    sh.exec(`git commit -m ${msg}`)
  }
  // 关联tag
  if (tag) {
    sh.exec(`git tag -a v${ver} -m ${msg} HEAD`)
  }
  // push commit? & tag?
  if (push) {
    sh.exec(`git push`)
    
  }
  if (pushtag) {
    sh.exec(`git push origin v${ver}`)
  }
}
/**
 * 开始询问
 */
async function start () {
  console.log('∷ 正在读取当前版本信息...')
  const package_file = utils.readFile('package.json')
  const { version: package_version } = utils.parseJson(package_file)
  const custom_config = utils.getConfig('version', DEFAULT_CFG)
  // 读取配置文件
  const custom_version = getCustomVersion(custom_config)
  // 开始版本比对
  const old_version = custom_version || package_version
  if (!semver.valid(old_version)) {
    throw new Error('版本信息出错')
  }
  // 创建可选项
  const [major, minor, patch] = [semver.major(old_version), semver.minor(old_version), semver.patch(old_version),]
  const new_version_list = [
    {
      name: `不进行版本变更，只生成CHANGELOG`, value: 'cancel'
    },
    {
      name: `${major}.${minor}.${patch + 1}`, value: `${major}.${minor}.${patch + 1}`
    },
    {
      name: `${major}.${minor + 1}.0`, value: `${major}.${minor + 1}.0`
    },
    {
      name: `${(major + 1)}.0.0`, value: `${(major + 1)}.0.0`
    }
  ]
  const ans = await inquirer.prompt([{
    type: 'list',
    name: 'new_version',
    message: '选择版本',
    choices: new_version_list
  }]).then(res => {
    if (res.new_version !== 'cancel') {
      return inquirer.prompt([{
        type: 'confirm',
        name: 'commit',
        message: 'commit?'
      }, {
        type: 'confirm',
        name: 'tag',
        message: 'tag?'
      }, {
        type: 'confirm',
        name: 'push',
        message: 'push?'
      }]).then(ans => {
        return {
          ...ans,
          ...res
        }
      }).then(ans => {
        if (ans.tag) {
          return inquirer.prompt([{
            type: 'confirm',
            name: 'pushtag',
            message: 'push this tag?'
          }]).then(res => {
            return {
              ...ans,
              ...res
            }
          })
        } else {
          return ans
        }
      })
    } else {
      return res
    }
  })
  const { new_version } = ans
  if (new_version !== 'cancel' && new_version !== old_version) {
    // 版本不一致，开始更改文件版本信息
    writePackage(package_file, new_version)
    writeCustomOutFile(custom_config, new_version)
    // 生成changlog后开始执行git方法
    genChangelog(custom_config)
    doGit(ans, custom_config)
  }
  if (new_version === 'cancel') {
    genChangelog(custom_config)
  }
}

module.exports = {
  start
}