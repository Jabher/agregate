// @flow
import { v1 as neo4j } from 'neo4j-driver'
import * as R from 'ramda'
import debug from 'debug'
import '../../polyfill'
import type { Query, QueryBuilder } from '../../types'

const logError = debug('Agregate:ConnectionError')
const logConnInit = debug('Agregate:ConnectionInitialized')
const logTx = debug('Agregate:ConnectionTransaction')
const logQueryStart = debug('Agregate:ConnectionQuery:started')
const logQueryResult = debug('Agregate:ConnectionQuery:fulled')

class Auth {
  auth: Object;

  constructor(auth) {
    this.auth = auth
  }
}

class BasicAuth extends Auth {
  constructor(login: string, password: string) {
    super(neo4j.auth.basic(login, password))
  }
}

const rehydrationSession: {
  nodes: {
    // noinspection JSUnresolvedVariable
    [key: string]: neo4j.types.Node
  },
  // noinspection JSUnresolvedVariable
  relations: neo4j.types.Relation[]
} = {
  nodes: {},
  relations: []
}

const resetRehydrationSession = () =>
  Object.assign(rehydrationSession, {
    nodes: {},
    relations: []
  })

type Init = {
  cluster?: boolean,
  readonly?: boolean
};

export class Driver {
  static basic = (...args) => new BasicAuth(...args);

  init: Promise<void>;
  driver: any;
  session: any;
  __transactionQueue = [];

  constructor(host: string,
              auth: Auth,
              { cluster = false, readonly = false }: Init = {}) {
    const uri = `${cluster ? 'bolt+routing' : 'bolt'}://${host}`
    let driver
    let session
    // eslint-disable-next-line promise/param-names
    const timeout = new Promise(res => setTimeout(res, 1000))
    // eslint-disable-next-line promise/avoid-new
    const connectPromise = new Promise(async (resolve, reject) => {
      await timeout
      driver = neo4j.driver(uri, auth.auth)

      // todo bring nifty tricks to protect API from writing clauses
      session = driver.session(readonly ? 'READ' : 'WRITE')

      driver.onCompleted = () => resolve([driver, session])
      driver.onError = err => {
        logError(err)
        if (err.message.includes('authentication failure')) reject(err)

        const getErrCode = R.path(['fields', 0, 'code'])
        switch (getErrCode(err)) {
          case 'Neo.ClientError.Security.Unauthorized':
            reject(new Error(err.fields[0].message))
            break
          default:
            console.error(err)
            reject(new Error('unknown error encountered'))
            break
        }
      }
    })
    const unlazyConnectionPromise = (async () => {
      await timeout
      const now = Date.now()
      const response = await driver.session().run('return {now}', { now })
      if (response.records[0]._fields[0] !== now) { throw new Error('connection is configured wrong') }
    })()

    this.init = Promise.all([
      connectPromise,
      unlazyConnectionPromise
    ]).then(([[driver, session]]) => {
      this.driver = driver
      this.session = session
      logConnInit('Driver successfully initialized', this)
      return true
    })

    // trick to disable default catch when any other .catch is executed
    this.init.catch(err =>
      logError('connection error encountered for', host, auth, err)
    )
  }

  // noinspection JSUnusedGlobalSymbols
  async close() {
    await this.init.catch(err => err)
    if (this.session) {
      // noinspection JSUnresolvedFunction
      await new Promise(resolve => this.session.close(resolve)) // eslint-disable-line promise/avoid-new
    }
    if (this.driver) {
      // noinspection JSUnresolvedFunction
      this.driver.close()
    }
  }

  rehydrate(value: any): any {
    if (Array.isArray(value)) {
      // noinspection JSUnresolvedFunction
      return value.map(entry => this.rehydrate(entry))
    }
    if (value instanceof neo4j.types.Node) {
      return this.rehydrateNode(value)
    }
    if (value instanceof neo4j.types.Relationship) {
      return this.rehydrateRelation(value)
    }
    if (neo4j.isInt(value)) {
      // noinspection JSUnresolvedFunction
      return value.toNumber()
    }
    return value
  }

  dehydrate(value: any): any {
    if (Array.isArray(value)) {
      // noinspection JSUnresolvedFunction
      return value.map(entry => this.dehydrate(entry))
    }

    return value
  }

  // noinspection JSUnresolvedVariable
  rehydrateRelation(value: neo4j.types.Relation): { start: any, end: any, [key: string]: any } {
    const relation = this.resolveRelation(value)
    rehydrationSession.relations.push(relation)
    // noinspection JSUnresolvedVariable
    relation.start = value.start
    // noinspection JSUnresolvedVariable
    relation.end = value.end
    return relation
  }

  // noinspection JSUnresolvedVariable
  rehydrateNode(value: neo4j.types.Node): Object {
    const node = this.resolveNode(value)
    rehydrationSession.nodes[value.identity.toString(36)] = node
    return node
  }

  // noinspection JSMethodCanBeStatic, JSUnresolvedVariable
  resolveRelation(value: neo4j.types.Relation): Object {
    // noinspection JSUnresolvedVariable
    return {
      __type: 'relation',
      labels: [value.type],
      properties: value.properties
    }
  }

  // noinspection JSMethodCanBeStatic, JSUnresolvedVariable
  resolveNode(value: neo4j.types.Node): Object {
    return {
      __type: 'node',
      labels: value.labels,
      properties: value.properties
    }
  }

  async query(...args: any[]) {
    const tx = await this.transaction()
    const result = await tx.query(...args)
    await tx.commit()
    return result
  }

  async transaction() {
    await this.init
    let res: () => any = () => {}
    // eslint-disable-next-line promise/avoid-new
    const deferred = new Promise(resolve => (res = resolve)).then(
      () =>
        (this.__transactionQueue = this.__transactionQueue.filter(
          val => val !== deferred
        ))
    )

    const txQueueBeforeThisTx = [...this.__transactionQueue]
    this.__transactionQueue.push(deferred)
    await Promise.all(txQueueBeforeThisTx)
    // noinspection JSUnresolvedFunction
    return new Transaction(this.session.beginTransaction(), this, res)
  }
}

export class Transaction {
  tx: any;
  __driver: Driver;
  __res: () => any;
  __isTransaction = true;

  // noinspection JSUnusedGlobalSymbols
  __onError: ?() => any;

  constructor(tx: any, driver: Driver, res: () => any) {
    logTx('beginning transaction')
    this.tx = tx
    this.__driver = driver
    this.__res = res
  }

  // noinspection JSUnusedGlobalSymbols
  async commit() {
    logTx('committing transaction')
    // noinspection JSUnresolvedFunction
    await this.tx.commit()
    this.__res()
  }

  // noinspection JSUnusedGlobalSymbols
  async rollback() {
    logTx('rolling back transaction')
    // noinspection JSUnresolvedFunction
    await this.tx.rollback()
    this.__res()
  }

  async query(query: string | QueryBuilder | Query) {
    try {
      if (typeof query === 'string') {
        return this.query({ statement: query })
      }
      if (query.toJSON instanceof Function) {
        return this.query(query.toJSON())
      }

      await this.__driver.init

      const { statement, parameters } = query
      const dehydratedParameters = this.__driver.dehydrate(parameters)
      logQueryStart(statement)
      logQueryStart(dehydratedParameters)

      // noinspection JSUnresolvedFunction
      const response = await this.tx.run(statement, dehydratedParameters)
      logQueryResult(
        'server answered for',
        statement,
        'with params:',
        dehydratedParameters
      )
      logQueryResult(response.summary)
      if (Array.isArray(response.records)) {
        for (const record of response.records) {
          logQueryResult(record)
        }
      } else {
        logQueryResult(response.records)
      }

      const { records } = response
      resetRehydrationSession()

      const result = this.__driver.rehydrate(
        records.map(({ _fields }) => _fields)
      )

      rehydrationSession.relations.forEach(rel =>
        Object.assign(rel, {
          start: rehydrationSession.nodes[rel.start.toString(36)] || undefined,
          end: rehydrationSession.nodes[rel.end.toString(36)] || undefined
        })
      )

      for (const { labels, start, end } of rehydrationSession.relations) {
        if (!start || !end) {
          continue
        }

        const startRelations = start.__relations
        const endRelations = end.__relations

        const startKeys = Object.keys(start).filter(
          key =>
            start[key] &&
            labels.includes(start[key].label) &&
            start[key].direction >= 0
        )
        const endKeys = Object.keys(end).filter(
          key =>
            end[key] &&
            labels.includes(end[key].label) &&
            end[key].direction <= 0
        )

        for (const label of labels) {
          for (const key of startKeys) {
            if (start[key].label === label) {
              if (start[key].isOnly) {
                startRelations[key] = end
              } else {
                if (!startRelations[key]) {
                  startRelations[key] = []
                }
                startRelations[key].push(end)
              }
            }
          }
          for (const key of endKeys) {
            if (end[key].label === label) {
              if (end[key].isOnly) {
                endRelations[key] = start
              } else {
                if (!endRelations[key]) {
                  endRelations[key] = []
                }
                endRelations[key].push(start)
              }
            }
          }
        }
      }

      logQueryResult(result)
      return result
    } catch (e) {
      logError('query failed', query, e)
      try {
        // noinspection JSUnresolvedFunction
        await this.tx.rollback()
      } catch (e) {
        // statements in the transaction have failed
        // and the transaction has been rolled back by driver
        // this is perfectly fine to ignore this error,
        // this is paranoid case
      }
      this.__res()
      throw e
    }
  }
}
