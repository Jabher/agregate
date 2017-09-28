// @flow
import '../polyfill'
import * as R from 'ramda'
import debug from 'debug'
import { Connection } from '../connection/connection'
import { Transaction } from '../connection/driver'
import { Record } from '../record'

const log = debug('Agregate:acceptsTransactionDeco')

const isTransaction = (val: Connection | Transaction) => R.has('__isTransaction', val)

export default function acceptsTransaction(target: Object,
                                           name: string,
                                           desc: Object) {
  const fn = desc.value

  desc.value = async function (...args) {
    const transactionPassed =
      args.length > 0 && isTransaction(R.last(args) || {})

    const originalConnection = Reflect.getOwnPropertyDescriptor(
      this,
      'connection'
    )
    const fnSignature = `<${[
      transactionPassed ? 'T' : '',
      originalConnection
        ? originalConnection.__isTransaction ? 'OT' : 'O'
        : ''].filter(a => a).join(',')}>`

    const fnName = (this instanceof Record ? `${this.constructor.name}.${name}` : `${this.name}#${name}`) + fnSignature
    const loggableArgs = transactionPassed ? args.slice(0, -1) : args
    const defineConnection = conn =>
      Object.defineProperty(this, 'connection', {
        configurable: true,
        value: conn
      })

    // if (
    //   transactionPassed &&
    //   this.connection &&
    //   this.connection !== R.last(args) &&
    //   isTransaction(this.connection)
    // ) {
    //   throw new Error('something strange is happening here')
    // }

    let result

    log('calling', fnName, ...loggableArgs)

    if (transactionPassed) {
      defineConnection(args.pop())
      try {
        result = await fn.apply(this, args)
        log('called', fnName, ...loggableArgs)
      } catch (e) {
        log('failed', fnName, ...loggableArgs, e)
      } finally {
        if (originalConnection) {
          Object.defineProperty(this, 'connection', originalConnection)
        } else {
          Reflect.deleteProperty(this, 'connection')
        }
      }
    } else if (!this.connection.__isTransaction) {
      const transaction = await this.connection.transaction()
      defineConnection(transaction)
      try {
        result = await fn.apply(this, args)
        log('called', fnName, ...loggableArgs)
        await transaction.commit()
        log('committed', fnName, ...loggableArgs)
      } catch (err) {
        log('failed', fnName, ...loggableArgs, err)
        await transaction.rollback().catch(log)
        log('rolled back', fnName, ...loggableArgs)
        throw err
      } finally {
        if (originalConnection) {
          Object.defineProperty(this, 'connection', originalConnection)
        } else {
          Reflect.deleteProperty(this, 'connection')
        }
      }
    } else {
      try {
        result = await fn.apply(this, args)
        log('called', fnName, ...loggableArgs)
      } catch (e) {
        log('failed', fnName, ...loggableArgs, e)
      }
    }

    return result
  }
}
