import {GraphDatabase} from 'neo4j'
import {CypherQuery} from '../Cypher/index'

export class GraphConnection {
    constructor(...args) {
        Object.assign(this, {
            db: new GraphDatabase(...args)
        })
    }

    query(query, params = {}) {
        if (query instanceof CypherQuery) {
            const req = query.getRawQuery()
            return this.query(req.query, req.params)
        }
        return new Promise((res, rej) =>
            this.db.cypher({query: Array.isArray(query) ? query.join('\n') : query, params}, (err, results) =>
                err ? rej(err) : res(results)))
    }
}