import debug from 'debug'
import {Cypher} from 'cypher-talker'

const log = debug('agregate:util')

export function promisifyQuery(queryObject, connection) {
    log(queryObject)

    if (queryObject.getRawQuery instanceof Function)
        return promisifyQuery(queryObject.getRawQuery(), connection)

    if (queryObject.query)
	    queryObject.query = Cypher.cleanup(queryObject.query)
    const response = new Promise((res, rej) =>
        connection.cypher(queryObject, (err, results) => err ? rej(err) : res(results)))
    response.then(data => log(queryObject, data), err => log(queryObject, err))
    return response
}
