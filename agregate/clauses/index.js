// @flow

export * as actions from './actions'
export * as constraints from './constraints'
export * as returns from './returns'

export const narrow = (order: string[], skip: number, limit: number) => ({
  order, skip, limit
})