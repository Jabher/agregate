import uuid from 'uuid';
import {Cypher as C} from 'cypher-talker';
import EventedClass from '../EventedClass';
import acceptsTransaction from '../util/acceptsTransaction';
import checkRecordExistence from '../util/checkRecordExistence';
import Relation from '../relation/Relation';

export default class BaseRecord extends EventedClass {
    static get label() { return this.name }

    static fromNode(node) { return new this(node.properties, {node}) }

    static getReflectableProps(props) {
        const {uuid, createdAt, updatedAt, ...reflectableProps} = props
        return reflectableProps
    }

    constructor(props = {}, metadata = {}) {
        super(metadata)
        Object.assign(this, this.constructor.getReflectableProps(props))
    }

    beforeCreate() { }

    afterCreate() { }

    beforeUpdate() { }

    afterUpdate() { }

    beforeDestroy() { }

    afterDestroy() { }

    get connection() { return this.constructor.connection }

    get uuid() { return this.metadata.node ? this.metadata.node.properties.uuid : undefined }

    get createdAt() { return this.metadata.node ? this.metadata.node.properties.createdAt : undefined }

    get updatedAt() { return this.metadata.node ? this.metadata.node.properties.updatedAt : undefined }

    get label() { return this.constructor.label }

    static selfQuery(key, query) {
        return query
            ? C.tag`(${C.raw(key)}:${C.raw(this.label)} {${C.literal(query)}})`
            : C.tag`(${C.raw(key)}:${C.raw(this.label)})`
    }

    selfQuery(key, query = {uuid: this.uuid}) {
        checkRecordExistence(this)
        return this.constructor.selfQuery(key, query)
    }

    toJSON() {
        const returnValue = {...this}
        for (let key of Object.keys(returnValue))
            if (returnValue[key] instanceof Relation || returnValue[key] instanceof Function)
                delete returnValue[key]

        return returnValue
    }

    @acceptsTransaction({force: true})
    async save() {
        const tx = this.connection
        const internalInstance = Object.defineProperties(
            Reflect.construct(BaseRecord, [{...this}, {node: this.metadata.node}], this.constructor), {
                connection: {value: tx, configurable: true},
                __proto__: {value: this}
            })

        const isUpdating = !!internalInstance.metadata.node
        await (isUpdating ? internalInstance.beforeUpdate(tx) : internalInstance.beforeCreate(tx))
        const entryName = 'entry';
        const requestContent = isUpdating
            ? C.tag`MATCH ${internalInstance.selfQuery(entryName)}
                        SET ${C.raw(entryName)} += ${internalInstance.toJSON()}, ${C.raw(entryName)}.updatedAt = timestamp()`
            : C.tag`CREATE (${C.raw(entryName)}:${C.raw(internalInstance.label)})
                        SET ${C.raw(entryName)} += ${internalInstance.toJSON()},
                            ${C.raw(entryName)}.createdAt = timestamp(),
                            ${C.raw(entryName)}.updatedAt = timestamp(),
                            ${C.raw(entryName)}.uuid = ${uuid.v4()}`
        const [{entry}] = await internalInstance.connection.query(C.tag`${requestContent} RETURN entry`)
        this.metadata.node = entry

        Object.assign(this, {
            ...this.constructor.getReflectableProps(entry.properties)
        })
        await (isUpdating ? this.afterUpdate(tx) : this.afterCreate(tx))
        process.nextTick(() => this.constructor.emit(isUpdating ? 'updated' : 'created', this))
        return this
    }

    @acceptsTransaction({force: true})
    async destroy() {
        checkRecordExistence(this)

        const tx = this.connection
        const internalInstance = Object.defineProperties(
            Reflect.construct(BaseRecord, [{...this}, {node: this.metadata.node}], this.constructor), {
                connection: {value: tx, configurable: true},
                __proto__: {value: this}
            })

        await internalInstance.beforeDestroy(tx)
        await internalInstance.connection.query(C.tag`
                MATCH ${internalInstance.selfQuery('entry')}
                DELETE entry`)
        await internalInstance.afterDestroy(tx)

        this.metadata.node = null
        process.nextTick(() => this.constructor.emit('destroyed', this))
        return this
    }
}
