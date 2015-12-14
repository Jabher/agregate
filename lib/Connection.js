import {GraphDatabase} from 'neo4j'
export const db = new GraphDatabase('http://neo4j:password@localhost:7474')

export const query = (query, params = {}) =>
    new Promise((res, rej) =>
        db.cypher({query: Array.isArray(query) ? query.join('\n') : query, params}, (err, results) =>
            err ? rej(err) : res(results)))