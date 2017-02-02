import Queryable from '../connection/Queryable';

export default function acceptsTransaction(opts) {
    if (arguments.length > 1)
        return acceptsTransactionDecorator(...arguments)
    const forceTransaction = opts.hasOwnProperty('force') ? opts.force : false

    return acceptsTransactionDecorator

    function acceptsTransactionDecorator(target, name, desc) {
        const fn = desc.value

        desc.value = function (...args) {
            const transactionPassed = args[args.length - 1] instanceof Queryable
            const transaction = transactionPassed
                ? args.pop()
                : (forceTransaction ? this.connection.transaction() : undefined)

            if (!transaction)
                return fn.apply(this, args)

            Object.defineProperty(this, 'connection', {configurable: true, value: transaction})

            const result = fn.apply(this, args);
            const output = transactionPassed
                ? result
                : result
                    .catch(e => console.log('result error ', e))
                    .then(
                        () => transaction.commit(),
                        () => transaction.rollback()
                    )
                    .catch(e => console.log('random error appears!', e));

            return output
                .then(() => Reflect.deleteProperty(this, 'connection'))
                .then(() => result);
        }
    }
}
