import EventEmitter from 'events'

const metadata = new WeakMap()

const eventEmitters = new WeakMap()
function getEmitter(scope) {
    if (!eventEmitters.has(scope))
        eventEmitters.set(scope, new EventEmitter())
    return eventEmitters.get(scope)
}

export class MetaClass {

    static on(type, fn) { getEmitter(this).on('event', (eventType, ...args) => (type === eventType) && fn(...args)) }

    static emit(...args) {getEmitter(this).emit('event', ...args)}

    constructor(metadata) { this.metadata = metadata }

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
