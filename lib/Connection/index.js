import debug from 'debug'
import {GraphDatabase} from 'neo4j'
import {Cypher} from '../Cypher/index'

const log = debug('ActiveGraphRecord:connection')

export class GraphConnection {
    constructor(...args) {
        log('GraphConnection constructed', ...args)
        Object.assign(this, {db: new GraphDatabase(...args)})
    }

    async query(query, params = {}) {
        if (query instanceof Cypher) {
            const req = query.getRawQuery()
            return this.query(req.query, req.params)
        }

        log('query perform attempt', query, params)

        // babel bug, cannot use const
        let result = await new Promise((res, rej) =>
            this.db.cypher({query: Array.isArray(query) ? query.join('\n') : query, params},
                (err, results) => err ? rej(err) : res(results)))
        log('query success', query, params, result)
        return result
    }
}
