const metadata = new WeakMap()

export class MetaClass {
    static get metadata() {return metadata.get(this) || (this.metadata = {})}

    static set metadata(val) {metadata.set(this, val)}

    get metadata() {return metadata.get(this) || (this.metadata = {})}

    set metadata(val) {metadata.set(this, val)}
}