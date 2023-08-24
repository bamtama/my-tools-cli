const fs = require('fs')
const FTPClient = require('ftp')
const { Buffer } = require('buffer')
const ProgressBar = require('progress')
const path = require('path')
const { minimatch } = require('minimatch')
const utils = require('./utils')
// const { stdout: slog } = require('single-line-log')

const transfer = (str, encode) => {
  return Buffer.from(str, encode).toString('utf-8')
}

class FtpCore {
  MAX_TRY = 2
  constructor(auth, cfg) {
    this.ftp = null
    this.tryCount = 1
    this.localFiles = []
    this.remoteRoot = cfg.remotePath + cfg.remoteDefaultDir
    this.localRoot = cfg.localDir
    this.delExcludes = cfg.delExcludes
    this.uploadExcludes = cfg.uploadExcludes
    this.auth = auth
    this.ftp = null
    this.bar = null
  }
  start () {
    console.info('∷ 开始读取本地文件...')
    this.readLocalFiles(this.localRoot)
    const count = this.getAllFiles().length
    console.info('✔ 读取完毕，本地文件数量：', count)
    this.ftp = new FTPClient()
    this.ftp.on('ready', () => {
      console.info('ftp ready：连接成功')
      this.clearRemote().then(res => {
        if (res) {
          this.uploadingFile(this.localFiles)
        }
      })
    })
    this.ftp.on('end', () => {
      console.info('ftp end：连接结束')
      process.exit(0)
    })
    this.ftp.on('error', err => {
      console.error('ftp err', err)
    })
    this.ftp.on('close', err => {
      err && console.log('ftp close', err)
    })
    // 连接服务器
    console.info('∷ 开始连接服务器, 目标目录：', this.remoteRoot)
    this.ftp.connect({
      ...this.auth,
      port: 21,
      connTimeout: 1000 * 30, // 连接超时时间
      pasvTimeout: 1000 * 30, // PASV data 连接超时时间
      keepalive: 1000 * 10 // 多久发送一次请求，以保持连接
    })
  }
  readLocalFiles (filePath) {
    const files = fs.readdirSync(filePath, { withFileTypes: true })
    for (const file of files) {
      if (file.isFile()) {
        // 是文件
        const _localPath = path.join(filePath, file.name)
        // 如果属于不上传的文件(路径是从{localRoot\}开始的)
        const doNotUpload = this.uploadExcludes.some(p => minimatch(_localPath.replace(this.localRoot, '').replace('\\', ''), p))
        if (!doNotUpload) {
          const _remoteDir = path.join(this.remoteRoot, filePath.replace(this.localRoot, ''))
          this.localFiles.push({
            _localPath,
            _remoteDir,
            _remotePath: path.join(_remoteDir, file.name)
          })
        }
      } else {
        // 是文件夹
        this.readLocalFiles(path.join(filePath, file.name))
      }
    }
  }
  getAllFiles () {
    return this.localFiles
  }
  findRemoteExsit () {
    return new Promise((resolve, reject) => {
      this.ftp.cwd(this.remoteRoot, (err, curdir) => {
        if (err) {
          console.info('∷ 未定位远程目录，即将创建', this.remoteRoot)
          resolve()
        } else {
          console.info('✔ 已定位远程目录，准备清理')
          resolve()
        }
      })
    })
  }
  async clearRemote () {
    try {
      await this.findRemoteExsit()
      const filelist = []
      await this.findFileRemoteWaitForDel('', filelist)
      console.log('∷ 远程目录中待删除的文件数量：', filelist.length)
      // 开始删除
      this.bar = new ProgressBar('∷ 正在清理远程目录 [:current/:total]', filelist.length)
      const reslist = await Promise.all(filelist.map(file => this.delFileRemote(file)))
      const suclist = reslist.filter(res => res.suc)
      if (suclist.length === filelist.length) {
        console.log('✔ 清理成功：', reslist.length)
        return true
      } else {
        console.log(`删除失败${reslist.filter(res => !res.suc)}`)
        return false
      }
    } catch (err) {
      console.error('也不知道哪里错了总之是错了，就先退出', err)
      process.exit(0)
    }
  }
  findFileRemoteWaitForDel (path, reslist) {
    return new Promise((resolve, reject) => {
      this.ftp.list(path, (err, list) => {
        if (err) {
          err && console.log('ftp.list err:', path, err)
          resolve()
        } else {
          if (list && list.length > 0) {
            let dirs = []
            list.forEach(file => {
              const filename = transfer(file.name, 'latin1')
              const filepath = path ? path + '\\' + filename : filename
              if (file.type === '-') {
                // 是文件
                const doNotDel = this.delExcludes.some(p => minimatch(filepath, p)) // 剔除非删除文件
                !doNotDel && reslist.push({
                  ...file,
                  d_filename: filename,
                  d_filepath: filepath
                })
              }
              if (file.type === 'd') {
                // 是文件夹
                dirs.push({
                  ...file,
                  d_filepath: filepath
                })
              }
            })
            if (dirs.length > 0) {
              return Promise.all(dirs.map(dir => {
                return this.findFileRemoteWaitForDel(dir.d_filepath, reslist)
              })).finally(() => {
                resolve()
              })
            } else {
              resolve()
            }
          } else {
            resolve()
          }
        }
      })
    })
  }
  delFileRemote (file) {
    return new Promise((resolve, reject) => {
      this.ftp.delete(file.d_filepath, (err) => {
        this.bar.tick()
        if (err) {
          const msg = `删除失败：${file.d_filename}`
          console.error(msg)
          resolve({ suc: false, msg })
        } else {
          resolve({ suc: true })
        }
      })
    })
  }
  // 正在上传文件
  async uploadingFile (filelist) {
    console.log('===================== \n 开始准备第', this.tryCount, '次上传文件，待上传文件数量：', filelist.length, '请稍候')
    this.bar = new ProgressBar('∷ 文件上传中 [:current/:total]', {
      total: filelist.length,
      renderThrottle: 66
    })
    const start_time = new Date().getTime()
    const fail_uploads = [] // 上传失败的文件
    const reslist = await utils.asyncPool(20, filelist, this.tickUpload.bind(this))
    for (const res of reslist) {
      // const res = await this._uploadFile(file)
      // this.bar.tick()
      if (!res.suc) {
        console.log('上传失败', res.msg)
        fail_uploads.push(res.file)
      }
    }
    const distance_time = new Date().getTime() - start_time
    const fail_len = fail_uploads.length
    const suc_len = filelist.length - fail_len
    console.log('✔ 本次用时：', distance_time, 'ms')
    console.log('∷ 上传成功：', suc_len, ' 上传失败：', fail_len)
    if (fail_len === 0 || this.tryCount === this.MAX_TRY) {
      // do nothing
      console.info('✔ 上传结束，本次上传', suc_len, '个文件')
      console.log('∷ 1S后将关闭连接')
      setTimeout(() => {
        this.ftp.end()
      }, 1000)
    } else {
      this.tryCount++
      await this.uploadingFile(fail_uploads)
    }
  }
  // 实际上传文件动作，会覆盖同名文件
  _uploadFile (file) {
    return new Promise((resolve, reject) => {
      this.ftp.mkdir(file._remoteDir, true, err1 => {
        // if (err1) {
        //   reject(new Error('这里是无需创建文件夹or创建文件夹，暂时不要抛出错误', err1))
        // }
        // 从工作目录拿到本地文件
        const tmplocal = path.resolve(process.cwd(), file._localPath)
        this.ftp.put(tmplocal, file._remotePath, err2 => {
          if (err2) {
            // reject(new Error('上传文件失败', filepath))
            resolve({ suc: false, msg: `：${file._remotePath}, ${err2 || ''}。`, file })
          } else {
            resolve({ suc: true })
          }
        })
      })
    })
  }
  async tickUpload (file) {
    return await this._uploadFile(file).then(res => {
      this.bar.tick()
      return res
    })
  }
}

const init = (auth, cfg) => {
  // 检测配置项
  for (const k in cfg) {
    if (!cfg[k]) {
      throw new Error('请检查配置项')
    }
  }
  const { remoteDefaultDir, remotePath } = cfg
  // 拼接远程目录地址
  if (!remotePath) {
    console.error('未获取到远程部署目录配置', remotePath)
    return
  }
  if (!remoteDefaultDir) {
    console.error('未获取到远程站点目录配置', remoteDefaultDir)
    return
  }
  const ftpCore = new FtpCore(auth, cfg)
  ftpCore.start()
}


module.exports = {
  init
}