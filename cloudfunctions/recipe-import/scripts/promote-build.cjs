'use strict'

const fs = require('fs')
const path = require('path')

const functionRoot = path.resolve(__dirname, '..')
const buildRoot = path.join(functionRoot, 'lib')

/**
 * 云函数入口运行在根目录；把所有顶层编译模块一起提升，确保 Provider 适配器
 * 使用相对 require 时仍能被云端运行时找到。
 */
for (const fileName of fs.readdirSync(buildRoot)) {
  if (!fileName.endsWith('.js')) continue
  fs.copyFileSync(path.join(buildRoot, fileName), path.join(functionRoot, fileName))
}
