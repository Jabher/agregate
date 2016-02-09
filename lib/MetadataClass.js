const metadata = new WeakMap()

export default class MetadataClass {
    constructor(metadata) { this.metadata = metadata }

    static get metadata() {return metadata.get(this) || (this.metadata = {})}

    static set metadata(val) {metadata.set(this, val)}

    get metadata() {return metadata.get(this) || (this.metadata = {})}

    set metadata(val) {metadata.set(this, val)}
}
