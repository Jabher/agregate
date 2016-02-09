import EventEmitter from 'events'
import MetadataClass from './MetadataClass'

const eventEmitters = new WeakMap()

function getEmitter(scope) {
    if (!eventEmitters.has(scope))
        eventEmitters.set(scope, new EventEmitter())
    return eventEmitters.get(scope)
}

export default class EventedClass extends MetadataClass {
    static on(type, fn) { getEmitter(this).on(type, fn) }

    static once(type, fn) { getEmitter(this).once(type, fn) }

    static emit(type, ...args) {getEmitter(this).emit(type, ...args) }

    static removeAllListeners(event) {getEmitter(this).removeAllListeners(event) }
}