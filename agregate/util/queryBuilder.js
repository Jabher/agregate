// @flow
import { Cypher as C, Var } from '../cypher'

// noinspection JSUnusedGlobalSymbols
const whereQueries = {
  $gt: (key, val) => C.tag`${key}>${val}`,
  $gte: (key, val) => C.tag`${key}>=${val}`,
  $lt: (key, val) => C.tag`${key}<${val}`,
  $lte: (key, val) => C.tag`${key}<=${val}`,
  $exists: (key, val) =>
    val ? C.tag`exists(${key})` : C.tag`NOT exists(${key})`,
  $startsWith: (key, val) => C.tag`${key} STARTS WITH ${val}`,
  $endsWith: (key, val) => C.tag`${key} ENDS WITH ${val}`,
  $contains: (key, val) => C.tag`${key} CONTAINS ${val}`,
  $has: (key, val) => C.tag`${val} IN ${key}`,
  $in: (key, val) => C.tag`${key} IN ${val}`
}

const { isArray } = Array

export function buildQuery(varKey: Var, params: { [string]: any } = {}): C[] {
  const keys = Object.keys(params)
  if (keys.length === 0) {
    return []
  }

  return keys
    .map(key => [C.tag`${varKey}.${C.raw(key)}`, params[key]])
    .map(
      ([token, param]) =>
        param instanceof Object && !Array.isArray(param)
          ? Object.keys(param)
            .filter(key => whereQueries.hasOwnProperty(key))
            .map(
              key =>
                (key === '$in'
                  ? isArray(param[key]) && isArray(param[key][0])
                  : isArray(param[key]))
                  ? param[key].map(val => whereQueries[key](token, val))
                  : whereQueries[key](token, param[key])
            )
            .reduce((a, b) => a.concat(b), [])
          : C.tag`${token} = ${param}`
    )
    .reduce((a, b) => a.concat(b), [])
}

const wrapQuery = query =>
  query.reduce(
    (acc, query) => (acc ? C.tag`${acc} AND ${query}` : C.tag`${query}`),
    null
  )

export function whereQuery(varKey: Var, params: {} | {}[] = {}): C {
  if (Array.isArray(params)) {
    if (params.length === 0) {
      return C.tag``
    }

    if (params.length === 1) {
      return whereQuery(varKey, params[0])
    }

    return (
      params
        .map(query => buildQuery(varKey, query))
        .filter(builtQuery => builtQuery.length > 0)
        .map(wrapQuery)
        .reduce(
          (acc, query) =>
            acc ? C.tag`${acc} OR (${query})` : C.tag`WHERE (${query})`,
          null
        ) || C.tag``
    )
  }

  const query = buildQuery(varKey, params)
  if (query.length === 0) return C.tag``

  return C.tag`WHERE ${wrapQuery(query)}`
}

export const whereOpts = (varKey: Var,
                          opts: { order?: string | string[], offset?: number, limit?: number } = {}) =>
  C.tag`
        ${order(varKey, opts.order)}
        ${offset(varKey, opts.offset)}
        ${limit(varKey, opts.limit)}`

export const order = (varKey: Var, value: void | string | string[]) => {
  if (!Array.isArray(value)) {
    return order(varKey, value ? [value] : [])
  }
  return (
    value
      .filter(a => a)
      .map(orderEntity => C.tag`${varKey}.${C.raw(orderEntity)}`)
      .reduce(
        (acc, tag) => (acc ? C.tag`${acc}, ${tag}` : C.tag`ORDER BY ${tag}`),
        null
      ) || C.tag``
  )
}

export const offset = (varKey: Var, value: ?number) =>
  C.raw(value ? `SKIP ${value}` : '')

export const limit = (varKey: Var, value: ?number) =>
  C.raw(value ? `LIMIT ${value}` : '')
