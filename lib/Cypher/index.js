class CypherRaw {
    constructor(string) {
        this.string = string
    }
}

export class CypherQuery {
    static tag(strings, ...values) {return new this(strings, values)}

    static raw(string) {return new CypherRaw(string)}

    static literal(object) {
        const keys = Object.keys(object)
        return new this([...keys.map(key => `${key}:`), ''], keys.map(key => object[key]))
    }

    static cleanup = (string) => string
        //.replace(/^ */img, '')
        //.replace(/ *$/img, '')
        //.replace(/\n+/img, ' ')
        .trim()
    static defaultPrefix = 'v'

    constructor([prefixString, ...strings], values) { Object.assign(this, {prefixString, strings, values}) }

    getRawQuery({prefix} = {prefix: CypherQuery.defaultPrefix}) {
        const getKey = index => `${prefix}${index}`
        const results = this.values.map((value, index) => {
                switch (true) {
                    case value instanceof CypherQuery:
                        return value.getRawQuery({prefix: `${getKey(index)}_`})
                    case value instanceof CypherRaw:
                        return {query: value.string}
                    default:
                        return {query: `{${getKey(index)}}`, params: {[getKey(index)]: value}}
                }
            })
            .map(({query, params}, index) =>
                ({query: `${query}${this.strings[index]}`, params}))

        return {
            query: CypherQuery.cleanup(results.reduce((string, {query}) => string + query, this.prefixString)),
            params: Object.assign({}, ...results.map(({params}) => params))
        }
    }
}


export const cypher = CypherQuery.tag.bind(CypherQuery)