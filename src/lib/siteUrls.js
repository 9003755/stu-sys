const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '')

const joinUrl = (baseUrl, path = '/') => {
  const normalizedBase = trimTrailingSlash(baseUrl)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const getCurrentOrigin = () => {
  if (typeof window === 'undefined') return ''
  return trimTrailingSlash(window.location.origin)
}

export const getAppSiteUrl = () => {
  const configuredUrl = trimTrailingSlash(import.meta.env.VITE_APP_SITE_URL || '')
  return configuredUrl || getCurrentOrigin()
}

export const getSuperSiteUrl = () => {
  const configuredUrl = trimTrailingSlash(import.meta.env.VITE_SUPER_SITE_URL || '')
  return configuredUrl || getCurrentOrigin()
}

export const buildAppUrl = (path = '/') => joinUrl(getAppSiteUrl(), path)

export const buildSuperUrl = (path = '/') => joinUrl(getSuperSiteUrl(), path)
