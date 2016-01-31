import debug from 'debug'
import {GraphDatabase} from 'neo4j'
import {Cypher} from 'cypher-talker'

const log = {
    info: debug('ActiveGraphRecord:info'),
    query: debug('ActiveGraphRecord:query')
}

export class AbstractQueryable {
    query() { throw new Error('method is not defined') }

    commit() {}

    rollback() {}
}

process.on('SIGINT', async function () {
    console.log('attempting to reject transactions')
    await Promise.all([...GraphTransaction.transactions].map(t => t.rollback()))
        .catch(e => e)
    process.exit()
})

class SubTransaction extends AbstractQueryable {
    constructor(scope) {
        super()
        this.scope = scope
    }

    get sub() { return new SubTransaction(this) }

    get completePromise() { return this.scope.completePromise }

    transaction() {return this}

    query(...args) { return this.scope.query(...args)}

    commit() {}

    rollback(...args) { return this.scope.rollback(...args)}
}

export class GraphTransaction extends AbstractQueryable {
    static transactions = new Set()

    queriesStack = new Set()

    constructor(db) {
        super()
        this.transaction = db.beginTransaction()
        GraphTransaction.transactions.add(this)
        this.completePromise = new Promise((res, rej) => {
            this.__onCommit = res
            this.__onRollback = rej
        })
    }

    async query(cypher) {
        const q = Promise.all([...this.queriesStack])
            .then(() => promisifyQuery(cypher, this.transaction))
        q.then(() => this.queriesStack.delete(q))
        this.queriesStack.add(q)
        return q
    }

    transaction() {return this.sub}

    get sub() { return new SubTransaction(this) }

    commit() {
        if (this.__rollbackQuery) {
            throw new Error('rollback in progress for transaction', this)
        } else if (this.__commitQuery) {
            return this.__commitQuery
        } else {
            return this.__commitQuery = this.query({commit: true})
                .then(() => GraphTransaction.transactions.delete(this))
                .then(() => this.__onCommit(this))
        }
    }

    rollback(reason) {
        reason instanceof Error ? debug(reason) : debug(new Error('transaction rollback'), reason)

        if (this.__commitQuery) {
            throw new Error('rollback in progress for transaction', this)
        } else if (this.__rollbackQuery) {
            return this.__rollbackQuery
        } else {
            return this.__rollbackQuery = this.query({rollback: true})
                .then(() => GraphTransaction.transactions.delete(this))
                .then(() => this.__onRollback(this))
        }
    }
}

export class GraphConnection extends AbstractQueryable {
    constructor(...args) {
        super()
        log.info('GraphConnection constructed', ...args)
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
    if (query instanceof Cypher)
        return promisifyQuery(query.getRawQuery(), connection)

    log.query(query)

    return new Promise((res, rej) =>
        connection.cypher(query, (err, results) => err ? rej(err) : res(results)))
}
