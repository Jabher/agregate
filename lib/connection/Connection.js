import {v1 as neo4j} from 'neo4j-driver';
import debug from 'debug';
import Queryable from './Queryable';
import {promisifyQuery, labels} from './util';
import Transaction from './Transaction';

const log = debug('agregate:Connection')

export default class Connection extends Queryable {
    static labels = labels;
    get labels() { return labels }

    classMap = new Map();

    constructor({host, username, password}) {
        super()
        log('GraphConnection constructed', host, username, password)
        Object.assign(this, {
            connection: neo4j.driver('bolt://' + host, neo4j.auth.basic(username, password)).session()
        })
    }

    transaction() { return new Transaction(this, this.connection.beginTransaction()) }

    async query(cypher) { return promisifyQuery(cypher, this.connection, this.classMap) }

    commit() { throw new Error('cannot commit flat connection') }

    rollback() { throw new Error('cannot rollback flat connection') }
}
