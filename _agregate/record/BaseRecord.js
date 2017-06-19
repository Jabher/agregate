// @flow
import "../polyfill"
import uuid from "uuid"
import { Cypher as C } from "../cypher"
import acceptsTransaction from "../util/acceptsTransaction"
import checkRecordExistence from "../util/checkRecordExistence"
import { Relation } from "../relation/"
import * as R from "ramda"
import { v1 as neo4j } from "neo4j-driver"
import { Connection } from "../connection"
import { Var } from "../cypher/index"

export const reflections: WeakMap<BaseRecord, neo4j.types.Node> = new WeakMap()
export const unassignablePropertiesCache: WeakMap<
  Class<BaseRecord>,
  string[]
> = new WeakMap()
type Query = ?{ [key: string]: any }

function* getPrototypeChain(_proto: Object) {
  let proto = _proto
  do {
    yield proto
    // eslint-disable-next-line no-cond-assign
  } while ((proto = Reflect.getPrototypeOf(proto)))
}

const getPrototypeProperties = R.pipe(
  R.prop("prototype"),
  getPrototypeChain,
  Array.from,
  R.map(Object.getOwnPropertyNames),
  R.flatten
)

export class BaseRecord {
  static get __unassignableProperties(): string[] {
    const cached = unassignablePropertiesCache.get(this)

    if (cached) return cached

    const unassignableProperties = getPrototypeProperties(this)

    unassignablePropertiesCache.set(this, unassignableProperties)
    return unassignableProperties
  }

  get __unassignableProperties(): string[] {
    return this.constructor.__unassignableProperties
  }

  static connection: Connection
  get connection(): Connection {
    return this.constructor.connection
  }

  static get __label(): string {
    return this.name
  }

  get __label(): string {
    return this.constructor.__label
  }

  get __properties(): ?Object {
    return this.__node ? this.__node.properties : void 0
  }

  static indexed: string[] = []
  static unique: Array<string[] | string> = []
  static required: string[] = []

  static async register() {
    //$FlowFixMe
    const uniquenessConstraints: string[] = this.unique.filter(
      value => typeof value === "string"
    )
    //$FlowFixMe
    const nodeKeyConstraints: string[][] = this.unique.filter(prop =>
      Array.isArray(prop)
    )
    return await this.connection.registerRecordClass(this, {
      label: this.__label,
      indices: this.indexed,
      uniquenessConstraints,
      nodeKeyConstraints,
      existenceConstraints: this.required
    })
  }

  __assign(props: Object) {
    R.pipe(
      R.toPairs,
      R.filter(([key]) => !this.__unassignableProperties.includes(key)),
      R.forEach(([key, val]) => {
        // $FlowFixMe
        this[key] = val
      })
    )(props)
  }

  constructor(props: Object = {}, node?: neo4j.types.Node) {
    this.__assign(props)
    if (node) {
      this.__node = node
    }
  }

  beforeCreate() {}

  afterCreate() {}

  beforeUpdate() {}

  afterUpdate() {}

  beforeDestroy() {}

  afterDestroy() {}

  get __isReflected(): boolean {
    return this.__node !== undefined
  }

  get __node(): neo4j.types.Node {
    return reflections.get(this)
  }

  set __node(node: ?neo4j.types.Node): void {
    node ? reflections.set(this, node) : reflections.delete(this)
  }

  get uuid(): ?string {
    if (this.__properties) return this.__properties.uuid
  }

  get createdAt(): ?number {
    if (this.__properties) return this.__properties.createdAt
  }

  get updatedAt(): ?string {
    if (this.__properties) return this.__properties.updatedAt
  }

  static __selfQuery(key: Var, query: Query): C {
    return query
      ? C.tag`(${key}:${C.raw(this.__label)} {${C.literal(query)}})`
      : C.tag`(${key}:${C.raw(this.__label)})`
  }

  static __namedSelfQuery(key: Var, query: Query): C {
    return C.tag`MATCH ${query
      ? C.tag`(${key}:${C.raw(this.__label)} {${C.literal(query)}})`
      : C.tag`(${key}:${C.raw(this.__label)})`}`
  }

  __selfQuery(key: Var, query?: Query) {
    checkRecordExistence(this)
    return this.constructor.__selfQuery(key, query || { uuid: this.uuid })
  }

  __namedSelfQuery(key: Var) {
    checkRecordExistence(this)
    return this.constructor.__namedSelfQuery(key, { uuid: this.uuid })
  }

  __namedHeadQuery(ref: Var) {
    return this.__namedSelfQuery(ref)
  }

  __namedTailQuery(ref: Var) {
    return this.__namedSelfQuery(ref)
  }

  toJSON(): Object {
    const dump = this.serialize()
    dump.uuid = this.uuid
    return dump
  }

  toPOJO() {
    //$FlowFixMe
    return R.fromPairs(R.keys(this).map(key => [key, this[key]]))
  }

  serialize() {
    return R.pipe(
      R.toPairs,
      R.reject(
        ([, value]) =>
          value instanceof Relation ||
          value instanceof Function ||
          value === undefined
      ),
      R.fromPairs
    )(this.toPOJO())
  }

  @acceptsTransaction
  async save() {
    const isUpdating = this.__isReflected
    const transaction = this.connection
    // $FlowFixMe
    const tempRecord = Object.defineProperties(
      new this.constructor(this.toPOJO(), this.__node),
      {
        connection: { value: transaction, configurable: true }
      }
    )
    tempRecord.__assign(this)

    // $FlowFixMe
    Reflect.setPrototypeOf(tempRecord, this)

    await (isUpdating ? tempRecord.beforeUpdate() : tempRecord.beforeCreate())
    const entryName = new Var()
    const requestContent = isUpdating
      ? C.tag`${tempRecord.__namedSelfQuery(entryName)}
                        SET ${entryName} += ${tempRecord.serialize()}, ${entryName}.updatedAt = timestamp()`
      : C.tag`CREATE (${entryName}:${C.raw(tempRecord.__label)})
                        SET ${entryName} += ${tempRecord.serialize()},
                            ${entryName}.createdAt = timestamp(),
                            ${entryName}.updatedAt = timestamp(),
                            ${entryName}.uuid = ${uuid.v4()}`

    const [[entry]] = await transaction.query(
      C.tag`${requestContent} RETURN ${entryName}`
    )

    const node = entry instanceof BaseRecord ? entry.__node : entry

    tempRecord.__node = node
    tempRecord.__assign(node.properties)

    await (isUpdating
      ? // $FlowFixMe
        tempRecord.afterUpdate(transaction)
      : // $FlowFixMe
        tempRecord.afterCreate(transaction))

    this.__node = tempRecord.__node
    this.__assign(tempRecord)
    return this
  }

  @acceptsTransaction
  async destroy() {
    if (!this.__isReflected) {
      return
    }

    const transaction = this.connection
    // $FlowFixMe
    const tempRecord = Object.defineProperties(
      new this.constructor(this.toPOJO(), this.__node),
      {
        connection: { value: transaction, configurable: true }
      }
    )

    tempRecord.__assign(this)

    // $FlowFixMe
    Reflect.setPrototypeOf(tempRecord, this)

    await tempRecord.beforeDestroy()

    const entry = new Var()

    await transaction.query(C.tag`
                ${tempRecord.__namedSelfQuery(entry)}
                DETACH DELETE ${entry}`)
    await tempRecord.afterDestroy()

    this.__node = undefined
    return this
  }
}
