import EventEmitter from 'events'

const metadata = new WeakMap()

const eventEmitters = new WeakMap()

export class MetaClass {

    static on(...args) {eventEmitters.get(this).on(...args)}

    static emit(...args) {eventEmitters.get(this).emit(...args)}

    constructor(metadata) {
        eventEmitters.set(this, new EventEmitter())
        this.metadata = metadata
    }

    static get metadata() {return metadata.get(this) || (this.metadata = {})}

    static set metadata(val) {metadata.set(this, val)}

    get metadata() {return metadata.get(this) || (this.metadata = {})}

    set metadata(val) {metadata.set(this, val)}
}

export class GraphEntity extends MetaClass {
    static label

    static __selfQuery(varName = '') { throw new Error('method not implemented') }

    __selfQuery(...args) { return this.constructor.__selfQuery(...args) }
}
