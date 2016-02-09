import 'core-js/shim'
import 'babel-regenerator-runtime'

import {GraphDatabase as DatabaseConnection} from 'neo4j'
import debug from 'debug'

import Queryable from './Queryable'
import {promisifyQuery} from './util'
import Transaction from './Transaction'

const log = debug('ActiveGraphRecord:Connection')

export default class Connection extends Queryable {
    classMap = new Map();

    constructor(...args) {
        super()
        log('GraphConnection constructed', ...args)
        Object.assign(this, {connection: new DatabaseConnection(...args)})
    }

    transaction() { return new Transaction(this, this.connection.beginTransaction()) }

    async query(cypher) { return promisifyQuery(cypher, this.connection) }

    commit() { throw new Error('cannot commit flat connection') }

    rollback() { throw new Error('cannot rollback flat connection') }
}
