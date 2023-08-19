const fs = require('fs')
const FTPClient = require('ftp')
const { Buffer } = require('buffer')
const ProgressBar = require('progress')
const path = require('path')
const { minimatch } = require('minimatch')

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
      this.clearRemote().then(() => {
        this.uploadFiles()
      })
    })
    this.ftp.on('end', () => {
      console.info('ftp end：连接结束')
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
  clearRemote () {
    return new Promise((resolve, reject) => {
      this.ftp.cwd(this.remoteRoot, (err, curdir) => {
        if (err) {
          console.info('∷ 未定位远程目录，即将创建', this.remoteRoot)
          resolve()
        } else {
          console.info('✔ 已定位远程目录，准备清理')
          const filelist = []
          this.findFileRemoteWaitForDel('', filelist).then(() => {
            console.log('∷ 远程目录中待删除的文件数量：', filelist.length)
            // 开始删除
            this.bar = new ProgressBar('∷ 正在清理远程目录 [:bar]', filelist.length)
            return Promise.all(filelist.map(file => this.delFileRemote(file))).then(reslist => {
              const suclist = reslist.filter(res => res.suc)
              if (suclist.length === filelist.length) {
                console.log('✔ 清理成功：', reslist.length)
                resolve()
              } else {
                console.log(`删除失败${reslist.filter(res => !res.suc)}`)
                reject(new Error('删除失败'))
              }
            })
          })
        }
      })
    })
  }
  asyncFtpList = path => {
    return new Promise((resolve, reject) => {
      this.ftp.list(path, (err, list) => {
        if (!err && list && list.length > 0) {
          resolve(list)
        } else {
          err && console.log('asyncFtpList err:', err, path)
          resolve([])
        }
      })
    })
  }
  async findFileRemoteWaitForDel (path, reslist) {
    const tmplist = await this.asyncFtpList(path)
    for (const file of tmplist) {
      const filename = transfer(file.name, 'latin1')
      const filepath = path ? path + '\\' + filename : filename
      if (file.type === 'd') {
        // 递归文件夹
        await this.findFileRemoteWaitForDel(filepath, reslist)
      }
      if (file.type === '-') {
        // 剔除非删除文件
        const doNotDel = this.delExcludes.some(p => minimatch(filepath, p))
        if (!doNotDel) {
          // 获取文件(文件名转码，获取实际删除用路径d_filepath)
          reslist.push({
            ...file,
            d_filename: filename,
            d_filepath: filepath
          })
        }
      }
    }
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
  uploadingFile (filelist) {
    console.log('∷ 开始准备第', this.tryCount, '次上传文件，待上传文件数量：', filelist.length, '请稍候')
    this.bar = new ProgressBar('∷ 文件上传中 [:bar]', filelist.length)
    const start_time = new Date().getTime()
    return Promise.all(filelist.map(file => this._uploadFile(file))).then(reslist => {
      const distance_time = new Date().getTime() - start_time
      const fail_uploads = [] // 上传失败的文件
      reslist.forEach(res => {
        if (!res.suc) {
          console.log('上传失败', res.msg)
          fail_uploads.push(res.file)
        }
      })
      const len = reslist.length
      const fail_len = fail_uploads.length
      const suc_len = len - fail_len
      console.log('✔ 本次用时：', distance_time, 'ms')
      console.log('∷ 上传成功：', suc_len, ' 上传失败：', fail_len)
      // 返回上传失败的文件列表
      return {
        failList: fail_uploads,
        sucCount: suc_len
      }
    })
  }
  uploadFiles () {
    this.uploadingFile(this.localFiles).then(res => {
      console.info('✔ 上传结束，本次上传', res.sucCount, '个文件')
      if (res.failList.length > 0 && this.tryCount <= this.MAX_TRY) {
        this.tryCount++
        return this.uploadingFile(res.failList)
      } else {
        this.ftp.end()
      }
    })
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
          this.bar.tick()
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