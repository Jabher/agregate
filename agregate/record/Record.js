// @flow
import '../polyfill';
import { Cypher as C } from '../cypher';
import acceptsTransaction from '../util/acceptsTransaction';
import { BaseRecord } from './BaseRecord';
import * as queryBuilder from '../util/queryBuilder';
import * as R from 'ramda';
import { Var } from '../cypher/index';
import { BaseRelation } from '../relation/BaseRelation';

export class Record extends BaseRecord {
    static indexes = new Set();

    @acceptsTransaction
    static async firstWhere(params, opts, related) {
        const [res] = await this.where(params, { ...opts, limit: 1 }, related);
        return res;
    }

    @acceptsTransaction
        static async where(query: Object = {}, opts, related: Var[] = []) {
        const $params = Array.isArray(query) ? query.filter(q => !(q instanceof BaseRelation)) : query.$params || query;
        const $relations = Array.isArray(query) ? query.filter(q => q instanceof BaseRelation) : query.$relations || [];

        delete $params.$relations;

        const entry = new Var();

        const returningRelationVars = []
        const relationVars = $relations.map(relation => {
            const pointer = new Var()
            const relationPointer = new Var()
            if (related.includes(relation)) {
                returningRelationVars.push(pointer)
                returningRelationVars.push(relationPointer)
            }
            return relation.__namedSelfQuery(new Var(), relationPointer, entry, pointer)
        })

        const results = await this.connection.query(
            relationVars.reduce(
                (acc, relation) => C.tag`
        ${relation}
        ${acc}
        `, C.tag`
        ${this.__namedSelfQuery(entry)}
        ${queryBuilder.whereQuery(entry, $params)}
        RETURN ${C.spread([entry, ...returningRelationVars].reduce((acc, r) => [...acc, C.raw(','), r], []).slice(1))}
        ${queryBuilder.whereOpts(entry, opts)}
        `));
        return R.transpose(results)[0] || [];
    }

    @acceptsTransaction
    static async byUuid(uuid) {
        if (uuid === undefined) {
            throw new Error('trying to query by undefined uuid')
        }

        return await this.firstWhere({ uuid })
    }

    @acceptsTransaction
    static async firstOrInitialize(params) {
        if (params.uuid) {
            throw new Error('cannot explicitly create entry from uuid')
        }
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
