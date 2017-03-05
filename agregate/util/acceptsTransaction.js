// @flow
import '../polyfill';
import * as R from 'ramda';
import debug from 'debug';
const log = debug('Agregate:acceptsTransactionDeco')

export default function acceptsTransaction(target: Object, name: string, desc: Object) {
    const fn = desc.value

    desc.value = async function (...args) {
        const restoreOriginalConnectionProperty = this.hasOwnProperty('connection')
            ? (descriptor => () => Object.defineProperty(this, 'connection', descriptor))(Reflect.getOwnPropertyDescriptor(this, 'connection'))
            : () => Reflect.deleteProperty(this, 'connection');

        const defineConnection = conn => Object.defineProperty(this, 'connection', {configurable: true, value: conn})

        const transactionPassed = R.prop(['__isTransaction'], args[args.length - 1] || {})

        if (transactionPassed) {
            defineConnection(args.pop());
            const result = fn.apply(this, args)

            return result
                .then(restoreOriginalConnectionProperty, restoreOriginalConnectionProperty)
                .then(() => result)

        } else if (!this.connection.__isTransaction) {
            const transaction = await this.connection.transaction();
            defineConnection(transaction)
            const result = fn.apply(this, args)

            return result
                .then(
                    () => transaction.commit(),
                    err => log(err) && transaction.rollback()
                )
                .then(restoreOriginalConnectionProperty, restoreOriginalConnectionProperty)
                .then(() => result)
        } else {
            return fn.apply(this, args);
        }
    }
}
