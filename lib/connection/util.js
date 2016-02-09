import debug from 'debug'
//noinspection ES6UnusedImports
import {Cypher} from 'cypher-talker/build/Cypher/index'

const log = debug('ActiveGraphRecord:util')

export function promisifyQuery(query, connection) {
    log(query)

    if (query.getRawQuery instanceof Function)
        return promisifyQuery(query.getRawQuery(), connection)

    const response = new Promise((res, rej) =>
        connection.cypher(query, (err, results) => err ? rej(err) : res(results)))
    response.then(data => log(query, data), err => log(query, err))
    return response
}
