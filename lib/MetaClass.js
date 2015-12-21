const metadata = new WeakMap()

export class MetaClass {
    constructor(metadata) { this.metadata = metadata }

    static get metadata() {return metadata.get(this) || (this.metadata = {})}

    static set metadata(val) {metadata.set(this, val)}

    get metadata() {return metadata.get(this) || (this.metadata = {})}

    set metadata(val) {metadata.set(this, val)}
}

export class GraphEntity extends MetaClass {
    __selfQuery(varName = '') { throw new Error('method not implemented') }
}
