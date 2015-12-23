import 'babel-polyfill'
const classMap = new Map()

export default {
    registerRecordClass(Class = this) {
        classMap.set(Class.label, Class)
    },

    nodeToRecord(node) {
        const label = node.labels[0]
        const Class = classMap.get(label)
        return new Class(node.properties, {node})
    }
}
