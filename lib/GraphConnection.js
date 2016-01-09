import 'babel-polyfill'
import debug from 'debug'
import {GraphDatabase} from 'neo4j'
import {Cypher} from 'cypher-talker'

const log = debug('ActiveGraphRecord:connection')

export class GraphTransaction {
    constructor(db) { this.transaction = db.beginTransaction() }

    async query(cypher) { return promisifyQuery(cypher, this.transaction) }

    commit() { return this.query({commit: true}) }

    rollback() { return this.query({rollback: true}) }
}

export class GraphConnection {
    constructor(...args) {
        log('GraphConnection constructed', ...args)
        Object.assign(this, {db: new GraphDatabase(...args)})
    }

    transaction() { return new GraphTransaction(this.db) }

    async query(cypher) {
        if (Array.isArray(cypher)) {
            const transaction = new GraphTransaction(this.db)
            try {
                const results = []
                while (cypher.length > 0)
                    results.push(await cypher.shift())
                await transaction.commit()
                return results
            } catch (e) {
                transaction.rollback()
                throw e
            }
        } else {
            return promisifyQuery(cypher, this.db)
        }
    }
}

function promisifyQuery(query, connection) {
    log('query perform attempt', query)

    return new Promise((res, rej) =>
        connection.cypher(query instanceof Cypher ? query.getRawQuery() : query,
            (err, results) => err ? rej(err) : res(results)))
}
