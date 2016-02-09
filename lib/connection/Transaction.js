import Queryable from './Queryable'
import SubTransaction from './SubTransaction'
import {promisifyQuery} from './util'

const transactions = new Set()

process.on('SIGINT', function() {
    console.log('attempting to reject transactions')
    Promise.all([...transactions].map(t => t.rollback()))
        .catch(e => e)
        .then(() => process.exit())
})

export default class Transaction extends Queryable {

    get classMap() { return this.metadata.connection.classMap }

    transaction() { return new SubTransaction(this) }

    constructor(connection, dbTransaction) {
        super()
        Object.assign(this.metadata, {connection, dbTransaction, queriesStack: new Set()})
        transactions.add(this)

        this.completed = new Promise((onCommit, onRollback) => Object.assign(this.metadata, {onCommit, onRollback}))
        this.completed
            .catch(e => e)
            .then(() => transactions.delete(this))
    }

    query(cypher) {
        const query = Promise.all([...this.metadata.queriesStack])
            .then(() => promisifyQuery(cypher, this.metadata.dbTransaction))

        this.metadata.queriesStack.add(query)
        query.then(() => this.metadata.queriesStack.delete(query))

        return query
    }

    commit() {
        beforeComplete(this)
        return this.query({commit: true})
            .then(() => this.metadata.onCommit(this))
    }

    rollback(reason) {
        beforeComplete(this)
        return this.query({rollback: true})
            .then(() => this.metadata.onRollback(this))
    }
}

function beforeComplete(tx) {
    if (tx.metadata.completing)
        throw new Error('transaction is closed')

    tx.metadata.completing = true
}
