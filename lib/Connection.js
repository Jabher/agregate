import {GraphDatabase} from 'neo4j'
let db
export function connect (...args) {
    db = new GraphDatabase(...args)
}
export const query = (query, params = {}) =>
    new Promise((res, rej) =>
        db.cypher({query: Array.isArray(query) ? query.join('\n') : query, params}, (err, results) =>
            err ? rej(err) : res(results)))