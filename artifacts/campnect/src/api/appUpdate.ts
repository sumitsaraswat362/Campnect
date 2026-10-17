import client from './client'

export type AppUpdateNotice = {
  enabled: boolean
  mode: 'soft' | 'force'
  title: string
  message: string
  storeUrl: string
  minimumVersionCode: number
  updatedAt: string
}

export const appUpdateApi = {
  get: () => client.get<AppUpdateNotice>('/app-update'),
}