import R from 'ramda';
import debug from 'debug';
import {v1 as neo4j} from 'neo4j-driver';
//noinspection ES6UnusedImports
import {Cypher} from 'cypher-talker/build/Cypher/index';

const log = debug('agregate:util')

export const labels = Symbol('node labels')

export function promisifyQuery(query, connection, classMap) {
    log(query)

    if (query.getRawQuery instanceof Function)
        return promisifyQuery(query.getRawQuery(), connection, classMap)

    console.log(query)
    const response = connection.run(query.query, query.params);

    response.then(
        data => log('query success', query, data),
        err => log('query error', query, err))

    return response
        .then(R.view(R.lensPath(['records', 0, '_fields'])))
        .then(results => results || [])
        .then(decodeResponse(classMap))
        .then(res => console.log('res is', res) || res )
}


export function decodeResponse(classMap) {
    return function decode (value) {
        switch (true) {
            case neo4j.isInt(value):
                return value.toNumber();
            case value instanceof neo4j.types.Node:
                const classes = value.labels.map(label => classMap.get(label));
                if (classes.length > 1)
                    throw new Error('non-determinant state: got more than 1 meaningful label', value.labels);
                if (classes.length === 0)
                    throw new Error('non-determinant state: 0 meaningful labels', value);
                const Class = classes[0];
                return Class.fromNode(decode(value.properties));
            case Array.isArray(value):
                return value.map(decode);
            case value instanceof Object:
                return R.fromPairs(
                    R.toPairs(value).map(([key, value]) => [key, decode(value)])
                )
            default:
                return value;
        }
    }
}