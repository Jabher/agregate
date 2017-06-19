// @flow
import "../../polyfill"
import type { Query, QueryBuilder } from "../../types"
import { v1 as neo4j } from "neo4j-driver"
import * as R from "ramda"
import debug from "debug"

const logError = debug("Agregate:ConnectionError")
const logConnInit = debug("Agregate:ConnectionInitialized")
const logTx = debug("Agregate:ConnectionTransaction")
const logQueryStart = debug("Agregate:ConnectionQuery:started")
const logQueryResult = debug("Agregate:ConnectionQuery:fulled")

class Auth {
  auth: Object

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
  nodes: { [key: string]: neo4j.types.Node },
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
}

export class Driver {
  static basic = (...args) => new BasicAuth(...args)

  init: Promise<void>
  driver: any
  session: any

  constructor(
    host: string,
    auth: Auth,
    { cluster = false, readonly = false }: Init = {}
  ) {
    const uri = `${cluster ? "bolt+routing" : "bolt"}://${host}`

    const driver = neo4j.driver(uri, auth.auth)

    // todo bring nifty tricks to protect API from writing clauses
    const session = driver.session(readonly ? "READ" : "WRITE")

    const connectPromise = new Promise((res, rej) => {
      driver.onCompleted = () => res([driver, session])
      driver.onError = err => {
        logError(err)
        if (err.message.includes("authentication failure")) rej(err)

        const getErrCode = R.path(["fields", 0, "code"])
        switch (getErrCode(err)) {
          case "Neo.ClientError.Security.Unauthorized":
            rej(new Error(err.fields[0].message))
            break
          default:
            rej(new Error("unknown error encountered"))
            break
        }
      }
    })
    const unlazyConnectionPromise = (async () => {
      const now = Date.now()
      const response = await driver.session().run("return {now}", { now })
      if (response.records[0]._fields[0] !== now)
        throw new Error("malconfigured connection occured")
    })()

    this.init = Promise.all([
      connectPromise,
      unlazyConnectionPromise
    ]).then(([[driver, session]]) => {
      this.driver = driver
      this.session = session
      logConnInit("Driver successfully initialized", this)
    })

    // trick to disable default catch when any other .catch is executed
    this.init.catch(err =>
      logError("connection error encountered for", host, auth, err)
    )
  }

  async close() {
    await this.init.catch(err => err)
    if (this.session) {
      await new Promise(res => this.session.close(res))
    }
    if (this.driver) {
      this.driver.close()
    }
  }

  rehydrate(value: any): any {
    if (Array.isArray(value)) {
      return value.map(entry => this.rehydrate(entry))
    }
    if (value instanceof neo4j.types.Node) {
      return this.rehydrateNode(value)
    }
    if (value instanceof neo4j.types.Relationship) {
      return this.rehydrateRelation(value)
    }
    if (neo4j.isInt(value)) {
      return value.toNumber()
    }
    return value
  }

  dehydrate(value: any): any {
    if (Array.isArray(value)) {
      return value.map(entry => this.dehydrate(entry))
    }

    return value
  }

  rehydrateRelation(
    value: neo4j.types.Relation
  ): { start: any, end: any, [key: string]: any } {
    const relation = this.resolveRelation(value)
    rehydrationSession.relations.push(relation)
    relation.start = value.start
    relation.end = value.end
    return relation
  }

  rehydrateNode(value: neo4j.types.Node): Object {
    const node = this.resolveNode(value)
    rehydrationSession.nodes[value.identity.toString(36)] = node
    return node
  }

  resolveRelation(value: neo4j.types.Relation): Object {
    return {
      __type: "relation",
      labels: [value.type],
      properties: value.properties
    }
  }

  resolveNode(value: neo4j.types.Node): Object {
    return {
      __type: "node",
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

  __transactionQueue = []

  async transaction() {
    await this.init
    let res: () => any = () => {}
    const deferred = new Promise(resFn => (res = resFn)).then(
      () =>
        (this.__transactionQueue = this.__transactionQueue.filter(
          val => val !== deferred
        ))
    )

    const txQueueBeforeThisTx = [...this.__transactionQueue]
    this.__transactionQueue.push(deferred)
    await Promise.all(txQueueBeforeThisTx)
    return new Transaction(this.session.beginTransaction(), this, res)
  }
}

class Transaction {
  tx: any
  __driver: Driver
  __res: () => any
  __isTransaction = true

  __onError: ?() => any

  constructor(tx: any, driver: Driver, res: () => any) {
    logTx("beginning transaction")
    this.tx = tx
    this.__driver = driver
    this.__res = res
  }

  async commit() {
    logTx("committing transaction")
    await this.tx.commit()
    this.__res()
  }

  async rollback() {
    logTx("rolling back transaction")
    await this.tx.rollback()
    this.__res()
  }

  async query(query: string | QueryBuilder | Query) {
    try {
      if (typeof query === "string") {
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

      const response = await this.tx.run(statement, dehydratedParameters)
      logQueryResult(
        "server answered for",
        statement,
        "with params:",
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
      logQueryResult(result)
      return result
    } catch (e) {
      logError("query failed", query, e)
      try {
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
