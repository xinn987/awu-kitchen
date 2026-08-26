'use strict'

const fs = require('fs')
const path = require('path')

const functionRoot = path.resolve(__dirname, '..')
const outputRoot = path.join(functionRoot, 'lib')
const modules = [
  'auth', 'cloud', 'errors', 'family', 'index', 'recipe-comment',
  'recipe-option-model', 'recipe-options', 'recipe', 'validation',
]

// 微信云函数运行层对自建编译子目录解析不稳定，部署前把运行文件平铺到函数根目录。
for (const moduleName of modules) {
  fs.copyFileSync(
    path.join(outputRoot, `${moduleName}.js`),
    path.join(functionRoot, `${moduleName}.js`),
  )
}
