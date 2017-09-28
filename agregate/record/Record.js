// @flow
import '../polyfill'
import { Cypher as C, Var } from '../cypher'
import acceptsTransaction from '../util/acceptsTransaction'
import { BaseRecord } from './BaseRecord'
import * as queryBuilder from '../util/queryBuilder'
import * as R from 'ramda'
import { BaseRelation } from '../relation/BaseRelation'

export class Record extends BaseRecord {
  // noinspection JSUnusedGlobalSymbols
  static indexes = new Set();

  @acceptsTransaction
  static async firstWhere(params, opts, related) {
    const results = await this.where(params, { ...opts, limit: 1 }, related)
    if (!results) {
      return undefined
    }
    return results[0]
  }

  @acceptsTransaction
  static async where(query: Object = {}, opts, related: Var[] = []) {
    const $params = Array.isArray(query)
      ? query.filter(q => !(q instanceof BaseRelation))
      : query.$params || query
    const $relations = Array.isArray(query)
      ? query.filter(q => q instanceof BaseRelation)
      : query.$relations || []

    delete $params.$relations

    const target = new Var()

    const returningRelationVars = []
    const relationVars = $relations.map(relation => {
      const pointer = new Var()
      const relationPointer = new Var()
      if (related.includes(relation)) {
        returningRelationVars.push(pointer)
        returningRelationVars.push(relationPointer)
      }
      return relation.__namedSelfQuery(
        new Var(),
        relationPointer,
        target,
        pointer
      )
    })

    const results = await this.connection.query(C.tag`
        ${C.spread(relationVars)}
        ${this.__namedSelfQuery(target)}
        ${queryBuilder.whereQuery(target, $params)}
        RETURN ${C.spread(
      R.flatten(
        [target, ...returningRelationVars].map(r => [C.raw(','), r])
      ).slice(1)
    )}
        ${queryBuilder.whereOpts(target, opts)}
        `)

    return R.transpose(results)[0] || []
  }

  @acceptsTransaction
  static async byUuid(uuid) {
    if (uuid === undefined) {
      throw new Error('trying to query by undefined uuid')
    }

    return this.firstWhere({ uuid })
  }

  @acceptsTransaction
  static async firstOrInitialize(params) {
    if (params.uuid) {
      throw new Error('cannot explicitly create entry from uuid')
    }
    let result = await this.firstWhere(params, this.connection)
    if (result) {
      return result
    }

    const newRecord = new this(params)

    return newRecord
    // $FlowFixMe
      .save(this.connection)
  }
}
