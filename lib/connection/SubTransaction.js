import Queryable from './Queryable'

export default class SubTransaction extends Queryable {
    get classMap() { return this.metadata.connection.classMap }

    constructor(transaction) {
        super()
        this.metadata.connection = transaction
    }

    get completed() { return this.metadata.connection.completed }

    transaction() { return new SubTransaction(this) }

    query(...args) { return this.metadata.connection.query(...args)}

    commit() {}

    rollback(...args) { return this.metadata.connection.rollback(...args)}
}
