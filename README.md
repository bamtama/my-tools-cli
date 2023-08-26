# my-tools-cli

来这里整点命令行工具


## 上传打包内容到指定服务器目录
### 安装
```
npm i my-tools-cli -D
```
### 使用
```
nf-deploy
```

自动询问连接用户信息、上传目录名；连接成功后会清理对应远程目录，并上传本地目录文件

首次使用会在项目根目录下生成对应的
- 配置项文件 .my-tools-cli-config.json
- 用户信息文件 .my-tools-cli-auth.json
- .gitignore中自动添加忽略配置项

可以使用命令行参数自定义上传目录
```
nf-deploy -cdir <your custom dir>
```

### 配置项
```
"deploy": {
  "remoteDefaultDir": "默认上传目录",
  "localDir": "dist", // 本地目录
  "uploadExcludes": [
    "**.zip"
  ], // 上传时忽略的文件，匹配规则见minimatch
  "delExcludes": [
    "**.zip"
  ] // 清理远程目录时忽略的文件，匹配规则见minimatch
}
```
> 参考依赖库
>
> [处理ftp传输：ftp](https://www.npmjs.com/package/ftp)：目前服务器支持ssh1
> 
> [处理中文：buffer](https://www.npmjs.com/package/buffer)


## 自动生成版本号并更新相关文件，生成日志文件(测试中)，node@>=16的话推荐直接用[release-it](https://www.npmjs.com/package/release-it)
### 安装
```
npm i my-tools-cli conventional-changelog conventional-changelog-cli -D
```

### 使用
```
nf-release
```
开始询问升级版本，后续操作

首次使用会在项目根目录下自动生成
- 配置项文件 .my-tools-cli-config.json

#### 使用流程（目前不处理tag冲突，需保证版本号不同）

选择取消 > 生成changelog
选择版本号 > commit > tag > push > pushtag

> 版本日志生成完全依赖conventional-changelog，可以根据自定义需求在配置中自行更换，默认为
> ```conventional-changelog -p angular -i CHANGELOG.md -s```

### 配置项
````
"version": {
  "match": "version: \\'(.*?)\\'", // 匹配规则
  "inFile": "src/utils/constant.js",  // 版本号输入文件
  "outFile": "src/utils/constant.js",  // 输出文件
  "changelog": "自定义生成changelog命令"
}
````

> 参考依赖库
>
> [conventional-changelog-cli](https://www.npmjs.com/package/conventional-changelog-cli)
> 
> [conventional-changelog](https://www.npmjs.com/package/conventional-changelog)

## 在scripts中配置自己需要的组合命令，例

```
  "upload": "nf-deploy",
  "release": "nf-release",
  "deploy": "vue-cli-service build && nf-deploy",
  "publish": "nf-release && vue-cli-service build && nf-deploy"
```