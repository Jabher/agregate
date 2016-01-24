import 'babel-polyfill'
import {Cypher} from 'cypher-talker'

export function checkRecordExistence(node) {
    if (!node.uuid)
        throw new Error(`cannot perform action for non-reflected record`)
}

export const getRecordLabelMap = records =>
    [...records.reduce((map, record) => map.has(record.label) ?
        map.set(record.label, [...map.get(record.label), record])
        : map.set(record.label, [record]), new Map())]

export const createParamsString = params =>
    Object.keys(params).map(key => `${key}: {${key}}`)

export const createNodeQuery = (label, params) =>
    params ?
        Cypher.tag`${Cypher.raw(label)} {${Cypher.literal(params)}}`
        : Cypher.tag`${Cypher.raw(label)}`

const classMap = new Map()

export const Converter = {
    registerRecordClass(Class = this) {
        classMap.set(Class.label, Class)
    },

    nodeToRecord(node) {
        const label = node.labels[0]
        const Class = classMap.get(label)
        return new Class(node.properties, {node})
    }
}
