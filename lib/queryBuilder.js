import {Cypher} from 'cypher-talker'

const whereQueries = {
    '$gt': (key, val) => Cypher.tag`${key}>${val}`,
    '$gte': (key, val) => Cypher.tag`${key}>=${val}`,
    '$lt': (key, val) => Cypher.tag`${key}<${val}`,
    '$lte': (key, val) => Cypher.tag`${key}<=${val}`,
    '$exists': (key, val) => val ? Cypher.tag`exists(${key})` : Cypher.tag`NOT exists(${key})`,
    '$startsWith': (key, val) => Cypher.tag`${key} STARTS WITH ${val}`,
    '$endsWith': (key, val) => Cypher.tag`${key} ENDS WITH ${val}`,
    '$contains': (key, val) => Cypher.tag`${key} CONTAINS ${val}`,
    '$has': (key, val) => Cypher.tag`${val} IN ${key}`,
    '$in': (key, val) => Cypher.tag`${key} IN ${val}`
}

const queryReducer = (acc, query) => Cypher.tag`${acc}${query}`

export function whereQuery(varKey, params) {
    return params && Object.keys(params).length > 0
        ? Object.keys(params)
        .map(key => [Cypher.raw(`${varKey}.${key}`), params[key]])
        .map(([token, param]) =>
            (param instanceof Object) && !Array.isArray(param)
                ? Object.keys(param)
                .filter(key => whereQueries.hasOwnProperty(key))
                .map(key => whereQueries[key](token, param[key]))
                .reduce(queryReducer, Cypher.raw(``))
                : Cypher.tag`${token} = ${param}`)
        .reduce(queryReducer, Cypher.raw(`WHERE `))
        : Cypher.raw(``)
}

export const whereOpts = (opts = {}) =>
    Cypher.tag`
        ${order(opts.order)}
        ${offset(opts.offset)}
        ${limit(opts.limit)}`


export const order = value =>
    value && !Array.isArray(value)
        ? order([value])
        : Cypher.raw(value ? `ORDER BY ${value.map(orderEntity => `entry.${orderEntity}`).join(',')}` : ``)


export const offset = value =>
    Cypher.raw(value ? `SKIP ${value}` : ``)


export const limit = value =>
    Cypher.raw(value ? `LIMIT ${value}` : ``)
