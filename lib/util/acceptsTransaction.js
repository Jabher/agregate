import Queryable from '../connection/Queryable'

export default function acceptsTransaction(opts) {
    if (arguments.length > 1)
        return acceptsTransactionDecorator(...arguments)
    const forceTransaction = opts.hasOwnProperty('force') ? opts.force : false

    return acceptsTransactionDecorator

    function acceptsTransactionDecorator(target, name, desc) {
        const fn = desc.value
        const originalArgsLength = fn.length

        desc.value = function (...args) {
            //if (!this.__connectionQueue)
            //    this.__connectionQueue = new WeakMap
            //else
            //    await Promise.all(this.__connectionQueue.values())

            const transactionPassed = args[args.length - 1] instanceof Queryable
            const transaction = transactionPassed
                ? args.pop()
                : (forceTransaction ? this.connection.transaction() : undefined)


            if (!transaction)
                return fn.apply(this, args)

            Object.defineProperty(this, 'connection', {configurable: true, value: transaction})
            const result = fn.apply(this, args)
            return (transactionPassed
                ? result
                : result.then(data => transaction.commit(), err => transaction.rollback()))
                .then(() => delete this.connection)
                .then(() => result)
        }
    }
}
