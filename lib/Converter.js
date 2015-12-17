const classMap = new Map()

export default {
    registerRecordClass(klass = this) {
        classMap.set(klass.label, klass)
    },

    nodeToRecord(node) {
        const label = node.labels[0]
        const Class = classMap.get(label)
        return new Class(node.properties, {node})
    }
}
