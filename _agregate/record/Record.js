// @flow
import "../polyfill"
import { Cypher as C } from "../cypher"
import acceptsTransaction from "../util/acceptsTransaction"
import { BaseRecord } from "./BaseRecord"
import * as queryBuilder from "../util/queryBuilder"
import * as R from "ramda"
import { Var } from "../cypher/index"
import { BaseRelation } from "../relation/BaseRelation"
import type { IParamsQuery, AdvancedQuery, IRelation } from "../types"

function arrayify<T>(el: T | T[]): T[] {
  return Array.isArray(el) ? el : [el]
}

export class Record extends BaseRecord {
  static indexes = new Set()

  @acceptsTransaction
  static async firstWhere(params, opts) {
    const [res] = await this.where(params, { ...opts, limit: 1 })
    return res
  }

  @acceptsTransaction
  static async where(query: AdvancedQuery = {}, opts) {
    let $params: IParamsQuery[] = []
    let $relations: IRelation[] = []
    if (Array.isArray(query)) {
      const isEveryItemRelation = query.every(q => q && q.isRelation)
      const isEveryItemNotRelation = !query.some(q => q && q.isRelation)
      if (isEveryItemRelation) {
        $relations = query
      } else if (isEveryItemNotRelation) {
        $params = query
      } else {
        throw new Error(
          "you should not mix relations and queries in same request"
        )
      }
    } else if (query.$params || query.$relations) {
      if (query.$params) {
        //$FlowFixMe
        $params = arrayify(query.$params)
      }
      if (query.$relations) {
        //$FlowFixMe
        $relations = arrayify(query.$relations)
      }
    } else if (query.isRelation) {
      $relations = [query]
    } else {
      $params = [query]
    }

    const entry = new Var()
    const results = await this.connection.query(
      $relations.reduce(
        (acc, relation) => C.tag`
        ${relation.__namedTailQuery(entry)}
        ${acc}
        `,
        C.tag`
        ${this.__namedSelfQuery(entry)}
        ${queryBuilder.whereQuery(entry, $params)}
        RETURN ${entry}
        ${queryBuilder.whereOpts(entry, opts)}
        `
      )
    )
    return R.transpose(results)[0] || []
  }

  @acceptsTransaction
  static async byUuid(uuid) {
    if (uuid === undefined) {
      throw new Error("trying to query by undefined uuid")
    }

    return await this.firstWhere({ uuid })
  }

  @acceptsTransaction
  static async firstOrInitialize(params) {
    if (params.uuid) {
      throw new Error("cannot explicitly create entry from uuid")
    }
    let result = await this.firstWhere(params, this.connection)
    if (result) {
      return result
    }

    const newRecord = new this(params)

    return await newRecord
      //$FlowFixMe
      .save(this.connection)
  }
}
