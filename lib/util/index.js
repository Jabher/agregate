import {cypher, CypherQuery} from '../Cypher/index'

export function checkRecordExistence(node, action) {
    if (!node.uuid)
        throw new Error(`cannot perform ${action} for non-reflected record`)
    if (node.metadata.destroyed)
        throw new Error(`cannot perform ${action} for destructed record`)
}


export function getRecordLabelMap(records) {
    const result = new Map()
    for (let record of records)
        if (result.has(record.label))
            result.get(record.label).push(record)
        else
            result.set(record.label, [record])

    return [...result]
}

export function createParamsString(params) {
    return Object.keys(params).map(key => `${key}: {${key}}`)
}

export function createNodeQuery(label, params) {
    return params ? cypher`${CypherQuery.raw(label)} {${CypherQuery.literal(params)}}` : cypher`${CypherQuery.raw(label)}`
}