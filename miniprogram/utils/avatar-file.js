const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const MAX_AVATAR_DIMENSION = 4096

function avatarFileError(code) {
  return Object.assign(new Error(code === 'AVATAR_TOO_LARGE'
    ? '头像图片不能超过 2 MiB 或 4096×4096 像素。'
    : '请重新选择有效的 JPEG 或 PNG 头像。'), { code })
}

async function validateAvatarFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim() || /[\r\n\0]/.test(filePath)) {
    throw avatarFileError('AVATAR_INVALID_IMAGE')
  }
  // Check the local file first; getImageInfo must not fetch an arbitrary remote URL.
  const file = await new Promise((resolve, reject) => {
    const fail = () => reject(avatarFileError('AVATAR_INVALID_IMAGE'))
    try { wx.getFileSystemManager().getFileInfo({ filePath, success: resolve, fail }) } catch (_) { fail() }
  })
  if (!Number.isSafeInteger(file?.size) || file.size <= 0) throw avatarFileError('AVATAR_INVALID_IMAGE')
  if (file.size > MAX_AVATAR_BYTES) throw avatarFileError('AVATAR_TOO_LARGE')
  const info = await new Promise((resolve, reject) => {
    const fail = () => reject(avatarFileError('AVATAR_INVALID_IMAGE'))
    try { wx.getImageInfo({ src: filePath, success: resolve, fail }) } catch (_) { fail() }
  })
  if (!['jpeg', 'jpg', 'png'].includes(info?.type) ||
      !Number.isSafeInteger(info.width) || info.width <= 0 ||
      !Number.isSafeInteger(info.height) || info.height <= 0) throw avatarFileError('AVATAR_INVALID_IMAGE')
  if (info.width > MAX_AVATAR_DIMENSION || info.height > MAX_AVATAR_DIMENSION) {
    throw avatarFileError('AVATAR_TOO_LARGE')
  }
}

module.exports = { validateAvatarFile }
