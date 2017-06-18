// @flow
import "../polyfill";
import * as R from "ramda";
import debug from "debug";
const log = debug('Agregate:acceptsTransactionDeco');

const isTransaction = R.prop(['__isTransaction']);

export default function acceptsTransaction(target: Object, name: string, desc: Object) {
  const fn = desc.value;

  desc.value = async function (...args) {
    log('calling', name, ...args, this);
    const defineConnection = conn => Object.defineProperty(this, 'connection', { configurable: true, value: conn });

    const transactionPassed = args.length > 0 && isTransaction(R.last(args) || {});

    const originalConnection = Reflect.getOwnPropertyDescriptor(this, 'connection');

    if (transactionPassed && this.connection && this.connection !== R.last(args) && isTransaction(this.connection)) {
      throw new Error('something strange is happening here');
    }

    let result;

    if (transactionPassed) {
      defineConnection(args.pop());
      try {
        result = await fn.apply(this, args);
      } finally {
        if (originalConnection) {
          Object.defineProperty(this, 'connection', originalConnection)
        } else {
          Reflect.deleteProperty(this, 'connection')
        }
      }
    } else if (!this.connection.__isTransaction) {
      const transaction = await this.connection.transaction();
      defineConnection(transaction);
      try {
        result = await fn.apply(this, args);
        await transaction.commit();
      } catch (err) {
        log(err);
        await transaction.rollback();
        throw err;
      } finally {
        if (originalConnection) {
          Object.defineProperty(this, 'connection', originalConnection)
        } else {
          Reflect.deleteProperty(this, 'connection')
        }
      }
    } else {
      result = await fn.apply(this, args);
    }

    return result;
  }
}
