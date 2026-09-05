import { lazy } from 'react'

const reloadKey = '__student_system_chunk_reload__'

export const lazyWithRetry = (importer) => lazy(async () => {
  try {
    const module = await importer()
    sessionStorage.removeItem(reloadKey)
    return module
  } catch (error) {
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
      return new Promise(() => {})
    }
    sessionStorage.removeItem(reloadKey)
    throw new Error('页面版本已更新，请刷新后重试。', { cause: error })
  }
})
