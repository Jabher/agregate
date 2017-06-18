// @flow
import "../polyfill";
import { Cypher as C } from "../cypher";
import acceptsTransaction from "../util/acceptsTransaction";
import { BaseRecord } from "./BaseRecord";
import * as queryBuilder from "../util/queryBuilder";
import * as R from "ramda";

export class Record extends BaseRecord {
  static indexes = new Set();

  @acceptsTransaction
  static async firstWhere(params, opts) {
    const [res] = await this.where(params, { ...opts, limit: 1 });
    return res;
  }

  @acceptsTransaction
  static async where(params, opts) {
    const results = await this.connection.query(C.tag`
        MATCH ${
      this.__selfQuery('entry')}
        ${queryBuilder.whereQuery('entry', params)}
        RETURN entry
        ${queryBuilder.whereOpts('entry', opts)}`);
    return R.transpose(results)[0] || [];
  }

  @acceptsTransaction
  static async byUuid(uuid) {
    if (uuid === undefined) {throw new Error('trying to query by undefined uuid')}

    return await this.firstWhere({ uuid })
  }

  @acceptsTransaction
  static async firstOrInitialize(params) {
    if (params.uuid) {throw new Error('cannot explicitly create entry from uuid')}
    let result = await this.firstWhere(params, this.connection);
    if (result) {
      return result;
    }

    const newRecord = new this(params);

    return await newRecord
      //$FlowFixMe
      .save(this.connection);
  }
}
